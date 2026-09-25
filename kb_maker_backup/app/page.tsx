"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  X,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import type { ProcessingState, UploadedFile } from "@/types/kb";
import Sidebar from "@/components/Sidebar";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
];

const ACCEPTED_EXTENSIONS = ".pdf,.png,.jpg,.jpeg,.webp,.tiff";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type === "application/pdf") return FileText;
  return ImageIcon;
}

export default function UploadPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState>({
    step: "idle",
    message: "",
    progress: 0,
  });

  const handleFileSelect = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      alert("Unsupported file type. Please upload a PDF or image file.");
      return;
    }

    const preview = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : undefined;

    setSelectedFile({
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview,
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const clearFile = useCallback(() => {
    if (selectedFile?.preview) URL.revokeObjectURL(selectedFile.preview);
    setSelectedFile(null);
  }, [selectedFile]);

  const processDocument = async () => {
    if (!selectedFile) return;

    try {
      // Step 1: Extract text
      setProcessing({
        step: "extracting",
        message: "Extracting text from document...",
        progress: 15,
      });

      const formData = new FormData();
      formData.append("file", selectedFile.file);

      const extractRes = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!extractRes.ok) {
        const err = await extractRes.json();
        throw new Error(err.error || "Extraction failed");
      }

      const { text, pageCount } = await extractRes.json();

      if (!text || text.trim().length === 0) {
        throw new Error(
          "No text could be extracted from the document. The file may be empty or contain only images without recognizable text."
        );
      }

      setProcessing({
        step: "generating",
        message: "Sending to AI for KB generation...",
        progress: 35,
      });

      // Step 2: Generate KB via SSE
      const genRes = await fetch("/api/generate-kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename: selectedFile.name }),
      });

      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.error || "KB generation failed");
      }

      const reader = genRes.body?.getReader();
      const decoder = new TextDecoder();
      let kbMarkdown = "";

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]") {
                  done = true;
                  break;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.text) {
                    kbMarkdown += parsed.text;
                    setProcessing({
                      step: "generating",
                      message: "Generating knowledge base...",
                      progress: Math.min(35 + (kbMarkdown.length / 100) * 2, 70),
                    });
                  }
                  if (parsed.error) {
                    throw new Error(parsed.error);
                  }
                } catch (e) {
                  // Skip non-JSON lines
                  if (e instanceof SyntaxError) continue;
                  throw e;
                }
              }
            }
          }
        }
      }

      // Step 3: Quality check
      setProcessing({
        step: "quality-checking",
        message: "Running quality checks...",
        progress: 80,
      });

      const qcRes = await fetch("/api/quality-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: kbMarkdown }),
      });

      let qualityReport = null;
      if (qcRes.ok) {
        qualityReport = await qcRes.json();
      }

      setProcessing({
        step: "complete",
        message: "Processing complete!",
        progress: 100,
      });

      // Store data for review page
      sessionStorage.removeItem("kb_active_draft_id");
      sessionStorage.setItem("kb_extracted_text", text);
      sessionStorage.setItem("kb_markdown", kbMarkdown);
      sessionStorage.setItem("kb_filename", selectedFile.name);
      if (pageCount) sessionStorage.setItem("kb_page_count", String(pageCount));
      if (qualityReport) {
        sessionStorage.setItem(
          "kb_quality_report",
          JSON.stringify(qualityReport)
        );
      }

      // Navigate to review page
      setTimeout(() => router.push("/review"), 500);
    } catch (error) {
      setProcessing({
        step: "error",
        message:
          error instanceof Error ? error.message : "An unexpected error occurred",
        progress: 0,
      });
    }
  };

  const isProcessing = processing.step !== "idle" && processing.step !== "error";
  const FileIcon = selectedFile ? getFileIcon(selectedFile.type) : Upload;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-auto" style={{ background: "var(--color-surface-secondary)" }}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Upload Document
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Upload a PDF or image to generate a structured knowledge base
            </p>
          </div>

          {/* Upload Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() =>
              !isProcessing &&
              document.getElementById("file-input")?.click()
            }
            className={`
              relative cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200
              ${isProcessing ? "pointer-events-none opacity-60" : "hover:border-blue-400"}
              ${isDragOver ? "upload-zone-active" : ""}
            `}
            style={{
              borderColor: isDragOver ? "var(--color-accent)" : "var(--color-border)",
              background: isDragOver ? "var(--color-accent-light)" : "var(--color-surface)",
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload document"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("file-input")?.click();
              }
            }}
          >
            <input
              id="file-input"
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleInputChange}
              className="hidden"
              disabled={isProcessing}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                {selectedFile.preview ? (
                  <img
                    src={selectedFile.preview}
                    alt="Preview"
                    className="w-20 h-20 rounded-lg object-cover border"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                ) : (
                  <div
                    className="w-20 h-20 rounded-lg flex items-center justify-center"
                    style={{ background: "var(--color-accent-light)" }}
                  >
                    <FileIcon className="w-8 h-8" style={{ color: "var(--color-accent)" }} />
                  </div>
                )}
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>
                    {selectedFile.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                {!isProcessing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFile();
                    }}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100 transition-colors"
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4" style={{ color: "var(--color-text-muted)" }} />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: "var(--color-surface-tertiary)" }}
                >
                  <Upload className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
                </div>
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>
                    Drop your document here or click to browse
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                    PDF, PNG, JPG, WEBP, TIFF — max 20 MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {processing.step !== "idle" && (
            <div className="mt-6 rounded-xl p-5" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              {/* Progress bar */}
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-surface-tertiary)" }}>
                <div
                  className="h-full rounded-full progress-bar"
                  style={{
                    width: `${processing.progress}%`,
                    background:
                      processing.step === "error"
                        ? "var(--color-danger)"
                        : processing.step === "complete"
                        ? "var(--color-success)"
                        : "var(--color-accent)",
                  }}
                />
              </div>
              {/* Status message */}
              <div className="flex items-center gap-2 mt-3">
                {processing.step === "error" ? (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-danger)" }} />
                ) : processing.step === "complete" ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-success)" }} />
                ) : (
                  <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: "var(--color-accent)" }} />
                )}
                <p
                  className="text-sm"
                  style={{
                    color:
                      processing.step === "error"
                        ? "var(--color-danger)"
                        : "var(--color-text-secondary)",
                  }}
                >
                  {processing.message}
                </p>
              </div>
            </div>
          )}

          {/* Process Button */}
          <div className="mt-6">
            <button
              onClick={processDocument}
              disabled={!selectedFile || isProcessing}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-white font-medium text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "var(--color-accent)",
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled)
                  e.currentTarget.style.background = "var(--color-accent-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-accent)";
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Process Document
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Error retry */}
          {processing.step === "error" && (
            <button
              onClick={() =>
                setProcessing({ step: "idle", message: "", progress: 0 })
              }
              className="mt-3 w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              Try Again
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
