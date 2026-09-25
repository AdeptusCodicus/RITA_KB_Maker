import { NextResponse } from "next/server";
import { listFiles, uploadFile, deleteFile } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const kbPath = process.env.DATABRICKS_KB_PATH;
    if (!kbPath) {
      return NextResponse.json(
        { error: "DATABRICKS_KB_PATH not configured" },
        { status: 500 }
      );
    }
    
    const files = await listFiles(kbPath);
    // Filter out directories, return only files
    const fileList = files.filter(f => !f.is_dir);
    
    return NextResponse.json({ 
      files: fileList,
      kbPath,
      assistantId: process.env.DATABRICKS_ASSISTANT_ID || "3295cb12-158b-449a-a372-f5dc14ff1ec6"
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
    const { title, markdown, filename } = await request.json();
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
      let formatted = title;
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
    
    return NextResponse.json({ success: true, path: fullPath });
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
    const { path } = await request.json();
    
    if (!path) {
      return NextResponse.json(
        { error: "Missing path" },
        { status: 400 }
      );
    }
    
    await deleteFile(path);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting from databricks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
