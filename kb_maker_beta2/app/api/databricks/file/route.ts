import { NextResponse } from "next/server";
import { readFile } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { error: "Missing required query parameter: path" },
        { status: 400 }
      );
    }

    const content = await readFile(path);
    const filename = path.split("/").pop() || "document.md";

    return NextResponse.json({
      success: true,
      path,
      filename,
      content,
      size: Buffer.byteLength(content, "utf-8"),
    });
  } catch (error) {
    console.error("Error fetching file content from Databricks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read file from Databricks" },
      { status: 500 }
    );
  }
}
