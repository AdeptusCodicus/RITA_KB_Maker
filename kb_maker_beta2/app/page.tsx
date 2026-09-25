"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  FileCode,
  FileSpreadsheet,
  FileCheck2,
  Sparkles,
  Clock,
  RotateCcw,
} from "lucide-react";
import type { ProcessingState, UploadedFile } from "@/types/kb";
import Sidebar from "@/components/Sidebar";

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.tiff";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(filename: string, type: string) {
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (ext === 'docx' || ext === 'doc') return FileText;
  if (ext === 'csv') return FileSpreadsheet;
  if (ext === 'md' || ext === 'txt') return FileCode;
  if (type.startsWith("image/") || ['png', 'jpg', 'jpeg', 'webp', 'tiff'].includes(ext)) return ImageIcon;
  return FileText;
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

  // Cached extracted text to avoid re-extracting document on retry
  const [extractedCache, setExtractedCache] = useState<{
    fileKey: string;
    text: string;
    pageCount?: number;
  } | null>(null);

  // Auto-retry state for AI queue saturation
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const maxRetries = 3;
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const cancelCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRetryCountdown(null);
  }, []);

  const resetAllState = useCallback(() => {
    cancelCountdown();
    setRetryAttempt(0);
    setProcessing({ step: "idle", message: "", progress: 0 });
  }, [cancelCountdown]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const validExtensions = ['pdf', 'docx', 'doc', 'txt', 'md', 'csv', 'png', 'jpg', 'jpeg', 'webp', 'tiff'];
    
    if (!validExtensions.includes(ext) && !file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert("Unsupported file format. Please upload a PDF, Word document, text/markdown file, or image.");
      return;
    }

    const preview = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : undefined;

    cancelCountdown();
    setExtractedCache(null);
    setRetryAttempt(0);
    setProcessing({ step: "idle", message: "", progress: 0 });

    setSelectedFile({
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview,
    });
  }, [cancelCountdown]);

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
    cancelCountdown();
    setExtractedCache(null);
    setRetryAttempt(0);
    setProcessing({ step: "idle", message: "", progress: 0 });
    if (selectedFile?.preview) URL.revokeObjectURL(selectedFile.preview);
    setSelectedFile(null);
  }, [cancelCountdown, selectedFile]);

  const processDocument = async (isRetry = false) => {
    if (!selectedFile) return;

    cancelCountdown();
    const currentAttempt = isRetry ? retryAttempt : 0;
    if (!isRetry) {
      setRetryAttempt(0);
    }

    try {
      let text = "";
      let pageCount: number | undefined;

      const fileKey = `${selectedFile.name}_${selectedFile.size}`;
      if (isRetry && extractedCache && extractedCache.fileKey === fileKey) {
        text = extractedCache.text;
        pageCount = extractedCache.pageCount;
      } else {
        // Step 1: Extract text
        setProcessing({
          step: "extracting",
          message: "Reading and extracting content...",
          progress: 15,
        });

        const formData = new FormData();
        formData.append("file", selectedFile.file);

        const extractRes = await fetch("/api/extract", {
          method: "POST",
          body: formData,
        });

        if (!extractRes.ok) {
          const err = await extractRes.json().catch(() => ({}));
          throw new Error(err.error || "Extraction failed");
        }

        const extractData = await extractRes.json();
        text = extractData.text;
        pageCount = extractData.pageCount;

        if (!text || text.trim().length === 0) {
          throw new Error(
            "No readable text could be extracted. The file may be empty or contain unreadable media."
          );
        }

        setExtractedCache({ fileKey, text, pageCount });
      }

      setProcessing({
        step: "generating",
        message: "AI synthesizing RITA knowledge base & workflows...",
        progress: 35,
      });

      // Step 2: Generate KB via SSE
      const genRes = await fetch("/api/generate-kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename: selectedFile.name }),
      });

      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        const isCap = Boolean(errData.isCapacity) || genRes.status === 503 || genRes.status === 429;
        const errObj = new Error(
          errData.error || (isCap ? "Google AI request queue is currently at capacity." : "KB generation failed")
        );
        (errObj as any).isCapacity = isCap;
        (errObj as any).retryAfterSeconds = errData.retryAfterSeconds;
        throw errObj;
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
                      message: "Generating RITA knowledge base...",
                      progress: Math.min(35 + (kbMarkdown.length / 100) * 2, 75),
                    });
                  }
                  if (parsed.error) {
                    const isCap =
                      Boolean(parsed.isCapacity) ||
                      parsed.type === "CAPACITY_EXCEEDED" ||
                      String(parsed.error).toLowerCase().includes("queue") ||
                      String(parsed.error).toLowerCase().includes("capacity");
                    const errObj = new Error(parsed.error);
                    (errObj as any).isCapacity = isCap;
                    throw errObj;
                  }
                } catch (e) {
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
        message: "Running automated RITA quality audit...",
        progress: 85,
      });

      let qualityReport = null;
      try {
        const qcRes = await fetch("/api/quality-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: kbMarkdown }),
        });

        if (qcRes.ok) {
          qualityReport = await qcRes.json();
          sessionStorage.removeItem("kb_audit_pending");
        } else {
          sessionStorage.setItem("kb_audit_pending", "true");
        }
      } catch (qcErr) {
        console.warn("Quality check error during upload:", qcErr);
        sessionStorage.setItem("kb_audit_pending", "true");
      }

      setProcessing({
        step: "complete",
        message: "Synthesis complete! Redirecting to workbench...",
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

      setRetryAttempt(0);

      // Navigate to review page
      setTimeout(() => router.push("/review"), 400);
    } catch (error: any) {
      console.error("Document processing error:", error);
      const isCapacity =
        Boolean(error?.isCapacity) ||
        String(error?.message || "").toLowerCase().includes("capacity") ||
        String(error?.message || "").toLowerCase().includes("queue") ||
        String(error?.message || "").includes("503") ||
        String(error?.message || "").includes("429");

      if (isCapacity) {
        const nextAttempt = currentAttempt + 1;
        setRetryAttempt(nextAttempt);

        if (nextAttempt <= maxRetries) {
          let count = 5;
          setRetryCountdown(count);
          setProcessing({
            step: "error",
            message: "Google AI request queue is currently at capacity.",
            progress: 0,
            isCapacity: true,
            retryCountdown: count,
            retryAttempt: nextAttempt,
            maxRetries,
          });

          countdownIntervalRef.current = setInterval(() => {
            count -= 1;
            if (count <= 0) {
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }
              setRetryCountdown(null);
              processDocument(true);
            } else {
              setRetryCountdown(count);
            }
          }, 1000);
        } else {
          setRetryCountdown(null);
          setProcessing({
            step: "error",
            message: "Google AI service queue remains congested. Please click Retry below to try again.",
            progress: 0,
            isCapacity: true,
            retryCountdown: null,
            retryAttempt: nextAttempt,
            maxRetries,
          });
        }
      } else {
        setRetryCountdown(null);
        setProcessing({
          step: "error",
          message: error instanceof Error ? error.message : "An unexpected error occurred",
          progress: 0,
          isCapacity: false,
        });
      }
    }
  };

  const isProcessing = processing.step !== "idle" && processing.step !== "error";
  const FileIcon = selectedFile ? getFileIcon(selectedFile.name, selectedFile.type) : Upload;

  return (
    <div className="flex h-screen bg-[#fafbfc]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-blue-600 text-xs font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Document Ingestion</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Transform Docs into RITA KBs
            </h1>
            <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Upload company SOPs, manuals, or forms to generate structured, one-step verified knowledge bases.
            </p>
          </div>

          {/* Upload Zone Card */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() =>
              !isProcessing &&
              document.getElementById("file-input")?.click()
            }
            className={`
              relative cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-all duration-300
              ${isProcessing ? "pointer-events-none opacity-60" : "hover:border-blue-500/60 hover:bg-white/80 hover:shadow-md"}
              ${isDragOver ? "upload-zone-active" : "border-slate-200 bg-white shadow-sm"}
            `}
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
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-sm"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                    <FileIcon className="w-7 h-7" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm text-slate-800">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                {!isProcessing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFile();
                    }}
                    className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6 text-slate-500" />
                </div>
                <div>
                  <p className="font-medium text-sm text-slate-800">
                    Click to browse or drop file here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    PDF, Word (.docx), Markdown, Plain Text, or Scanned Images
                  </p>
                </div>

                {/* Format Pills */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                  {['.PDF', '.DOCX', '.TXT', '.MD', '.CSV', 'IMAGES'].map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[10px] font-medium font-mono text-slate-500 bg-slate-100 rounded-md border border-slate-200/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Processing Status / Queue Capacity Card */}
          {processing.step === "error" && processing.isCapacity ? (
            <div className="mt-5 rounded-2xl p-5 bg-gradient-to-b from-amber-50/70 to-white border border-amber-200/80 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0 text-amber-700">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-amber-950">
                      AI Engine at Peak Capacity
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Queue Congested
                    </span>
                  </div>
                  <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                    Google Model Garden is currently handling heavy traffic and its request queue is full. Your document has been extracted and is safe in memory.
                  </p>

                  {retryCountdown !== null ? (
                    <div className="mt-3.5 flex items-center gap-2 text-xs font-medium text-amber-900 bg-amber-100/60 border border-amber-200/60 rounded-lg px-3 py-2">
                      <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin flex-shrink-0" />
                      <span>
                        Retrying automatically in <strong>{retryCountdown}s</strong> (Attempt {retryAttempt} of {maxRetries})...
                      </span>
                    </div>
                  ) : retryAttempt >= maxRetries ? (
                    <div className="mt-3.5 flex items-center gap-2 text-xs font-medium text-amber-900 bg-amber-100/60 border border-amber-200/60 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                      <span>Queue remains congested. You can click Retry Now to try again immediately.</span>
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center gap-2.5">
                    <button
                      onClick={() => {
                        cancelCountdown();
                        processDocument(true);
                      }}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Now</span>
                    </button>
                    <button
                      onClick={resetAllState}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-2xs"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : processing.step === "error" ? (
            <div className="mt-5 rounded-2xl p-5 bg-white border border-red-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-900">
                    Document Processing Error
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {processing.message}
                  </p>
                  <div className="mt-4 flex items-center gap-2.5">
                    <button
                      onClick={() => processDocument(true)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors shadow-2xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Try Again</span>
                    </button>
                    <button
                      onClick={resetAllState}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : processing.step !== "idle" && (
            <div className="mt-5 rounded-xl p-4 bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-2">
                  {processing.step === "complete" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                  <span className="font-medium text-slate-700">{processing.message}</span>
                </div>
                <span className="font-mono text-slate-400 font-medium">{Math.round(processing.progress)}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${processing.progress}%`,
                    background:
                      processing.step === "complete"
                        ? "#10b981"
                        : "linear-gradient(90deg, #3b82f6, #6366f1)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Main Action Button (shown when not in error state) */}
          {processing.step !== "error" && (
            <div className="mt-6">
              <button
                onClick={() => processDocument(false)}
                disabled={!selectedFile || isProcessing}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white font-medium text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.99]"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #4f46e5)",
                }}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Synthesizing Knowledge Base...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Knowledge Base</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
