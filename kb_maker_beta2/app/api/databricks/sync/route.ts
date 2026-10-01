import { NextResponse } from "next/server";
import { syncKnowledgeSources, getKnowledgeSources, getKbConfig } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const config = getKbConfig();
    const { sources, primarySource } = await getKnowledgeSources(config.assistantId);

    return NextResponse.json(
      {
        success: true,
        state: primarySource?.state || "UNKNOWN",
        knowledge_cutoff_time: primarySource?.knowledge_cutoff_time,
        assistantId: config.assistantId,
        kbPath: config.kbPath,
        source: primarySource,
        allSources: sources,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error checking assistant sync status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get sync status",
        state: "UNKNOWN",
      },
      { 
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    let assistantId: string | undefined;
    try {
      const body = await request.json();
      assistantId = body?.assistantId;
    } catch {
      // Body is optional
    }

    const config = getKbConfig();
    const effectiveAssistantId = assistantId || config.assistantId;

    // Check if assistant is already updating
    try {
      const { primarySource } = await getKnowledgeSources(effectiveAssistantId);
      if (primarySource?.state === "UPDATING") {
        return NextResponse.json({
          success: true,
          state: "UPDATING",
          alreadyUpdating: true,
          assistantId: effectiveAssistantId,
          message: "Assistant sync is already in progress",
        });
      }
    } catch (checkErr) {
      console.warn("Could not check pre-sync status, proceeding with sync:", checkErr);
    }

    const result = await syncKnowledgeSources(effectiveAssistantId);
    return NextResponse.json({
      success: true,
      state: "UPDATING",
      alreadyUpdating: false,
      assistantId: result.assistantId,
      message: "Knowledge assistant sync initiated",
    });
  } catch (error) {
    console.error("Error triggering assistant sync:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to trigger sync",
      },
      { status: 500 }
    );
  }
}
