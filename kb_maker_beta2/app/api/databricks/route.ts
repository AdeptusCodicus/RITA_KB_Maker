import { NextResponse } from "next/server";
import { listFiles, uploadFile, deleteFile } from "@/lib/databricks";
import { requireAuth } from "@/lib/auth/server";
import {
  getAllKBs,
  saveTeamKBRecord,
  deleteTeamKBRecord,
  getKBRecord,
  addAuditLog,
  getTeamDoc,
} from "@/lib/firestore";
import type { TeamKBRecord } from "@/types/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { session, errorResponse } = await requireAuth(request.headers);
    if (errorResponse) return errorResponse;

    const kbPath = process.env.DATABRICKS_KB_PATH;
    if (!kbPath) {
      return NextResponse.json(
        { error: "DATABRICKS_KB_PATH not configured" },
        { status: 500 }
      );
    }
    
    const files = await listFiles(kbPath);
    // Filter out directories, return only files
    const fileList = files.filter((f) => !f.is_dir);

    // Retrieve all recorded KB metadata from Firestore to attach team ownership
    let firestoreKBs: TeamKBRecord[] = [];
    try {
      firestoreKBs = await getAllKBs();
    } catch (e) {
      console.warn("Could not retrieve Firestore KB metadata:", e);
    }

    const kbMap = new Map<string, TeamKBRecord>();
    for (const record of firestoreKBs) {
      kbMap.set(record.filename.toLowerCase(), record);
    }

    // Enrich files with team ownership & readOnly permissions
    const enrichedFiles = await Promise.all(
      fileList.map(async (file) => {
        const filename = file.path.split("/").pop() || "";
        const metadata = kbMap.get(filename.toLowerCase());

        let teamName = "Organization Shared";
        let isTeamOwner = false;

        if (metadata?.teamId) {
          if (session.teamId === metadata.teamId) {
            isTeamOwner = true;
          }
          try {
            const team = await getTeamDoc(metadata.teamId);
            if (team) teamName = team.name;
          } catch {
            // non-blocking
          }
        }

        const isSuperadmin = session.isSuperadmin;
        const isViewer = session.role === "viewer";
        
        // Ownership check: Superadmins have full rights; Team members can edit if not Viewers
        const canEdit = isSuperadmin || (isTeamOwner && !isViewer);
        const readOnly = !canEdit;

        return {
          ...file,
          filename,
          teamId: metadata?.teamId || null,
          teamName,
          uploadedBy: metadata?.uploadedBy || null,
          qualityScore: metadata?.qualityScore || null,
          qualityGrade: metadata?.qualityGrade || null,
          isTeamOwner,
          canEdit,
          readOnly,
        };
      })
    );
    
    return NextResponse.json({ 
      files: enrichedFiles,
      kbPath,
      assistantId: process.env.DATABRICKS_ASSISTANT_ID || "3295cb12-158b-449a-a372-f5dc14ff1ec6",
      userRole: session.role,
      userTeamId: session.teamId,
    });
  } catch (error) {
    console.error("Error listing databricks files:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { session, errorResponse } = await requireAuth(request.headers, [
      "superadmin",
      "admin",
      "editor",
    ]);
    if (errorResponse) return errorResponse;

    const { title, markdown, filename, qualityScore, qualityGrade } = await request.json();
    const kbPath = process.env.DATABRICKS_KB_PATH;
    
    if (!kbPath) {
      return NextResponse.json(
        { error: "DATABRICKS_KB_PATH not configured" },
        { status: 500 }
      );
    }
    
    if (!markdown) {
      return NextResponse.json(
        { error: "Missing markdown content" },
        { status: 400 }
      );
    }

    // Determine filename
    let finalFilename = filename;
    if (!finalFilename) {
      let formatted = title || "Document";
      if (formatted.endsWith(".md")) {
        formatted = formatted.slice(0, -3);
      }
      formatted = formatted.replace(/[\s.]+/g, "_");
      formatted = formatted.replace(/[^a-zA-Z0-9_-]+/g, "");
      formatted = formatted.replace(/_+/g, "_");
      if (!formatted.startsWith("KB_")) formatted = `KB_${formatted}`;
      finalFilename = `${formatted}.md`;
    }

    // Ensure path ends without trailing slash and starts with one
    const basePath = kbPath.replace(/\/$/, "");
    const fullPath = `${basePath}/${finalFilename}`;
    
    await uploadFile(fullPath, markdown, true);

    // Save metadata record in Firestore under user's team
    const kbId = `kb_${finalFilename.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const targetTeamId = session.teamId || "global";
    const now = new Date().toISOString();

    const kbRecord: TeamKBRecord = {
      id: kbId,
      teamId: targetTeamId,
      title: title || finalFilename,
      filename: finalFilename,
      databricksPath: fullPath,
      qualityScore,
      qualityGrade,
      uploadedBy: {
        email: session.email || "unknown",
        name: session.name || session.email?.split("@")[0] || "Unknown",
      },
      lastEditedBy: {
        email: session.email || "unknown",
        name: session.name || session.email?.split("@")[0] || "Unknown",
      },
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveTeamKBRecord(kbRecord);
      await addAuditLog(
        targetTeamId,
        "KB_PUSHED",
        {
          email: session.email || "",
          name: session.name || undefined,
          role: session.role,
        },
        "kb",
        finalFilename,
        {
          fullPath,
          title: kbRecord.title,
          qualityScore,
        }
      );
    } catch (e) {
      console.warn("Failed to write Firestore record for uploaded KB:", e);
    }
    
    return NextResponse.json({ success: true, path: fullPath, kb: kbRecord });
  } catch (error) {
    console.error("Error uploading to databricks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { session, errorResponse } = await requireAuth(request.headers, [
      "superadmin",
      "admin",
      "editor",
    ]);
    if (errorResponse) return errorResponse;

    const { path } = await request.json();
    
    if (!path) {
      return NextResponse.json(
        { error: "Missing path" },
        { status: 400 }
      );
    }

    const filename = path.split("/").pop() || "";
    const kbId = `kb_${filename.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    // Ownership check: if metadata exists, verify team ownership
    let existingRecord: TeamKBRecord | null = null;
    try {
      existingRecord = await getKBRecord(kbId);
    } catch (e) {
      console.warn("Could not check KB record in Firestore:", e);
    }

    if (existingRecord && !session.isSuperadmin) {
      if (existingRecord.teamId !== session.teamId) {
        return NextResponse.json(
          { error: "You can only delete knowledge bases uploaded by your team" },
          { status: 403 }
        );
      }
    }
    
    await deleteFile(path);

    // Delete Firestore record & log audit
    if (existingRecord) {
      try {
        await deleteTeamKBRecord(kbId);
        await addAuditLog(
          existingRecord.teamId,
          "KB_DELETED",
          {
            email: session.email || "",
            name: session.name || undefined,
            role: session.role,
          },
          "kb",
          filename,
          {
            title: existingRecord.title,
            deletedPath: path,
          }
        );
      } catch (e) {
        console.warn("Could not clean up Firestore record on delete:", e);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting from databricks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
