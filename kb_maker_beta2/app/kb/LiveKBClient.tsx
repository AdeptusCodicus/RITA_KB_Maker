"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Database,
  RefreshCw,
  Search,
  FileText,
  FileCode,
  Clock,
  Trash2,
  Copy,
  Check,
  Download,
  Eye,
  Code,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Tag,
  BookOpen,
  RotateCcw,
  Sparkles,
  X,
  ExternalLink,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { saveDraft, setActiveDraftId } from "@/lib/drafts";

interface DatabricksFileItem {
  path: string;
  is_dir: boolean;
  file_size?: number;
  last_modified?: number;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModifiedDate(timestamp?: number): string {
  if (!timestamp) return "Unknown date";
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Unknown date";
  }
}

/* ── Markdown Content Renderer ──────────────────────────────────────────────── */

function MarkdownPreview({ content }: { content: string }) {
  const components = useMemo(
    () => ({
      p: ({ children }: any) => {
        const text = String(children);
        if (text.includes("→ Wait for user confirmation before")) {
          return (
            <div className="step-gate">
              <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span>{children}</span>
            </div>
          );
        }
        return <p>{children}</p>;
      },
      code: ({ node, inline, className, children, ...props }: any) => {
        const text = String(children);
        if (text.startsWith("[[") && text.endsWith("]]")) {
          return (
            <span className="token-badge">
              <Tag className="w-3 h-3 text-purple-600" />
              {text}
            </span>
          );
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
    }),
    []
  );

  return (
    <div className="preview-content p-6 sm:p-10 max-w-4xl mx-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* ── Live Knowledge Base Viewer Client ────────────────────────────────────────── */

export default function LiveKBClient() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  // Volume & Files state
  const [files, setFiles] = useState<DatabricksFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [kbPath, setKbPath] = useState<string>("/Volumes/agents/default/knowledge_base/google_ai_assistant");
  const [searchQuery, setSearchQuery] = useState("");

  // Assistant status
  const [assistantSyncState, setAssistantSyncState] = useState<"UPDATED" | "UPDATING" | "FAILED" | "UNKNOWN">("UNKNOWN");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Active document selection & content
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");

  // Notifications & Clipboard
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);

  // Delete & Undo state (safe grace period)
  const [fileToDeleteConfirm, setFileToDeleteConfirm] = useState<{ path: string; name: string } | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<{ path: string; name: string; countdown: number } | null>(null);
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: "success" | "info" | "error" = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Polling helper for sync completion (resilient 15-minute polling window: 225 attempts * 4s = 900s)
  const pollSyncCompletion = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    let attempts = 0;
    const maxAttempts = 225; // 225 * 4s = 900s = 15 minutes

    setIsSyncing(true);
    setAssistantSyncState("UPDATING");

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/databricks/sync?_t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const state = data.state || "UNKNOWN";
          setAssistantSyncState(state);

          if (data.knowledge_cutoff_time) {
            setLastSyncTime(
              new Date(data.knowledge_cutoff_time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            );
          }

          if (state === "UPDATED") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setIsSyncing(false);
            showToast("Knowledge Assistant is synchronized. Vector index updated.", "success");
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("kb_databricks_updated"));
              window.dispatchEvent(new CustomEvent("kb_assistant_synced", { detail: { state: "UPDATED" } }));
            }
            return;
          }

          if (state === "FAILED") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setIsSyncing(false);
            showToast("Knowledge Assistant sync encountered an error in Databricks.", "error");
            return;
          }
        }
      } catch (pollErr) {
        console.warn("Poll sync check encountered an error:", pollErr);
      }

      if (attempts >= maxAttempts) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setIsSyncing(false);
        showToast("Sync monitor timed out after 15 minutes. Please refresh.", "info");
      }
    }, 4000);
  }, []);

  // Fetch Assistant Sync Status
  const fetchAssistantStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/databricks/sync?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const state = data.state || "UNKNOWN";
        setAssistantSyncState(state);
        if (data.knowledge_cutoff_time) {
          setLastSyncTime(
            new Date(data.knowledge_cutoff_time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
        }
        if (data.kbPath) {
          setKbPath(data.kbPath);
        }

        // If assistant is currently updating, automatically initiate polling loop
        if (state === "UPDATING" && !pollTimerRef.current) {
          pollSyncCompletion();
        }

        return state;
      }
    } catch (err) {
      console.error("Failed to check assistant sync status:", err);
    }
    return "UNKNOWN";
  }, [pollSyncCompletion]);

  // Fetch Volume Files
  const fetchFiles = useCallback(async (preserveSelection?: boolean) => {
    setLoadingFiles(true);
    try {
      await fetchAssistantStatus();
      const res = await fetch(`/api/databricks?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const list: DatabricksFileItem[] = (data.files || []).filter((f: DatabricksFileItem) => !f.is_dir);
        setFiles(list);
        if (data.kbPath) {
          setKbPath(data.kbPath);
        }

        // Notify sidebar of update
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("kb_databricks_updated"));
        }

        // Preserve current selection or auto-select first file if available
        if (!preserveSelection && list.length > 0) {
          setSelectedFilePath((current) => {
            const stillExists = list.some((item) => item.path === current);
            return stillExists && current ? current : list[0].path;
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch Databricks volume files:", err);
      showToast("Failed to fetch volume directory", "error");
    } finally {
      setLoadingFiles(false);
      setIsInitialLoading(false);
    }
  }, [fetchAssistantStatus]);

  // Fetch Single File Content
  const fetchFileContent = useCallback(async (path: string) => {
    setLoadingContent(true);
    setContentError(null);
    try {
      const res = await fetch(`/api/databricks/file?path=${encodeURIComponent(path)}&_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load document content");
      }
      const data = await res.json();
      setFileContent(data.content || "");
    } catch (err) {
      console.error("Failed to load file content:", err);
      setContentError(err instanceof Error ? err.message : "Failed to load document content");
      setFileContent("");
    } finally {
      setLoadingContent(false);
    }
  }, []);

  // Initial load & Global Sync Event Subscription
  useEffect(() => {
    setIsMounted(true);
    fetchFiles();

    const handleSynced = () => {
      fetchAssistantStatus();
    };

    window.addEventListener("kb_assistant_synced", handleSynced);
    return () => {
      window.removeEventListener("kb_assistant_synced", handleSynced);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchFiles, fetchAssistantStatus]);

  // When selection changes, fetch content
  useEffect(() => {
    if (selectedFilePath) {
      fetchFileContent(selectedFilePath);
    } else {
      setFileContent("");
    }
  }, [selectedFilePath, fetchFileContent]);

  // Trigger manual Assistant sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    setAssistantSyncState("UPDATING");
    try {
      const res = await fetch("/api/databricks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to trigger sync");
      }
      const data = await res.json().catch(() => ({}));
      if (data.alreadyUpdating) {
        showToast("Assistant sync is already in progress in Databricks...", "info");
      } else {
        showToast("Knowledge Assistant sync initiated. Monitoring progress...", "info");
      }
      pollSyncCompletion();
    } catch (err) {
      console.error("Assistant sync failed:", err);
      setIsSyncing(false);
      showToast("Failed to trigger assistant sync", "error");
    }
  };

  // Copy Markdown to clipboard
  const handleCopyMarkdown = async () => {
    if (!fileContent) return;
    try {
      await navigator.clipboard.writeText(fileContent);
      setCopied(true);
      showToast("Verbatim Markdown copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  // Download File locally
  const handleDownload = () => {
    if (!fileContent || !selectedFilePath) return;
    const filename = selectedFilePath.split("/").pop() || "document.md";
    const blob = new Blob([fileContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`, "success");
  };

  // Open Live Document into Editor as a working draft
  const handleOpenAsDraft = () => {
    if (!selectedFilePath || !fileContent) return;
    const filename = selectedFilePath.split("/").pop() || "document.md";
    const title = filename.replace(/^KB_/, "").replace(/\.md$/, "").replace(/_/g, " ");

    const draft = saveDraft({
      title,
      filename,
      markdown: fileContent,
      extractedText: fileContent,
      qualityReport: null,
    });

    setActiveDraftId(draft.id);
    sessionStorage.setItem("kb_extracted_text", fileContent);
    sessionStorage.setItem("kb_markdown", fileContent);
    sessionStorage.setItem("kb_filename", filename);
    sessionStorage.removeItem("kb_quality_report");

    showToast("Imported to Review Workbench", "success");
    router.push("/review");
  };

  // Delete Confirmation flow
  const promptDeleteConfirmation = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const name = path.split("/").pop() || path;
    setFileToDeleteConfirm({ path, name });
  };

  const confirmDeleteAndStageUndo = () => {
    if (!fileToDeleteConfirm) return;
    const { path, name } = fileToDeleteConfirm;
    setFileToDeleteConfirm(null);

    if (pendingDeletion) {
      executeDelete(pendingDeletion.path);
    }

    setPendingDeletion({ path, name, countdown: 7 });

    let count = 7;
    if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    deleteTimerRef.current = setInterval(() => {
      count -= 1;
      setPendingDeletion((prev) => (prev ? { ...prev, countdown: count } : null));
      if (count <= 0) {
        if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
        executeDelete(path);
      }
    }, 1000);
  };

  const handleUndoDelete = () => {
    if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    setPendingDeletion(null);
    showToast("Deletion cancelled. Document preserved.", "success");
  };

  const executeDelete = async (path: string) => {
    if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    setPendingDeletion(null);

    try {
      const res = await fetch("/api/databricks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (res.ok) {
        if (selectedFilePath === path) {
          setSelectedFilePath(null);
          setFileContent("");
        }
        fetchFiles(true);
        showToast("File deleted. Auto-syncing Knowledge Assistant...", "info");

        // Trigger assistant sync
        setAssistantSyncState("UPDATING");
        fetch("/api/databricks/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
          .then(() => pollSyncCompletion())
          .catch((err) => console.error("Auto-sync after delete failed:", err));
      } else {
        showToast("Failed to delete file from volume", "error");
      }
    } catch (err) {
      console.error("Delete failed:", err);
      showToast("Failed to delete file", "error");
    }
  };

  // Filtered files
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter((f) => {
      const name = f.path.split("/").pop() || "";
      return name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    });
  }, [files, searchQuery]);

  // Selected file metadata
  const selectedFile = useMemo(() => {
    return files.find((f) => f.path === selectedFilePath);
  }, [files, selectedFilePath]);

  const selectedFileName = selectedFile
    ? selectedFile.path.split("/").pop() || selectedFile.path
    : "";

  // Content statistics
  const stats = useMemo(() => {
    if (!fileContent) return { words: 0, lines: 0, characters: 0 };
    const words = fileContent.trim().split(/\s+/).filter(Boolean).length;
    const lines = fileContent.split("\n").length;
    const characters = fileContent.length;
    return { words, lines, characters };
  }, [fileContent]);

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-800 overflow-hidden font-sans">
      {/* Primary Sidebar */}
      <Sidebar />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-slate-200 px-6 flex items-center justify-between gap-4 bg-white flex-shrink-0 z-10">
          <div className="flex items-center space-x-3 min-w-0 flex-1 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0 shadow-2xs">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-slate-900 tracking-tight leading-none truncate">
                  Current Knowledge Base
                </h1>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 flex-shrink-0">
                  Databricks Volume
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-lg mt-0.5" title={kbPath}>
                {kbPath}
              </p>
            </div>
          </div>

          {/* Right Header Badges & Actions */}
          <div className="flex items-center space-x-2.5 flex-shrink-0">
            {/* Assistant Status Pill */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs select-none"
              title={lastSyncTime ? `Last indexed at ${lastSyncTime}` : "Assistant status"}
            >
              {assistantSyncState === "UPDATING" || isSyncing ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[11px] text-slate-600 font-medium">Syncing assistant...</span>
                </>
              ) : assistantSyncState === "UPDATED" ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[11px] text-slate-600 font-medium">Assistant in sync</span>
                  {lastSyncTime && (
                    <span className="text-[10px] text-slate-400 font-mono border-l border-slate-200 pl-1.5 ml-0.5">
                      {lastSyncTime}
                    </span>
                  )}
                </>
              ) : assistantSyncState === "FAILED" ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-[11px] text-red-600 font-medium">Sync error</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span className="text-[11px] text-slate-500">Connecting...</span>
                </>
              )}
            </div>

            {/* Sync Assistant Button */}
            <button
              onClick={handleManualSync}
              disabled={isSyncing || assistantSyncState === "UPDATING"}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors disabled:opacity-50"
              title={
                isSyncing || assistantSyncState === "UPDATING"
                  ? "Databricks is currently updating the vector index"
                  : "Trigger vector index synchronization in Databricks"
              }
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing || assistantSyncState === "UPDATING" ? "animate-spin text-blue-600" : ""}`} />
              <span className="hidden md:inline">Sync Assistant</span>
            </button>

            {/* Refresh Directory Button */}
            <button
              onClick={() => fetchFiles(true)}
              disabled={loadingFiles}
              suppressHydrationWarning
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors"
              title="Refresh Directory"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? "animate-spin" : ""}`} />
            </button>

            {/* Quick New KB CTA */}
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-2xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">New KB</span>
            </button>
          </div>
        </header>

        {/* Global Toast Notification (Fixed Viewport Capsule) */}
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 px-4 py-3 text-xs rounded-xl flex items-center gap-2.5 bg-slate-900 text-white shadow-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : toast.type === "error" ? (
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
            )}
            <span className="text-slate-100 font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white transition-colors ml-1 p-0.5 rounded"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Two-Column Master-Detail Layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Column: Volume File Directory */}
          <aside className="w-80 sm:w-88 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
            {/* Directory Filter & Search Header */}
            <div className="p-3 border-b border-slate-100 space-y-2 bg-slate-50/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter production KBs..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
                <span className="font-medium">
                  {filteredFiles.length} {filteredFiles.length === 1 ? "document" : "documents"}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Live in Databricks
                </span>
              </div>
            </div>

            {/* Staged Undo Notification */}
            {pendingDeletion && (
              <div className="m-2.5 p-2.5 rounded-xl bg-slate-900 text-white flex items-center justify-between gap-2 shadow-sm text-xs animate-in slide-in-from-top-1 duration-150">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="truncate text-[11px]">
                    Deleting in {pendingDeletion.countdown}s
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleUndoDelete}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Undo</span>
                  </button>
                  <button
                    onClick={() => executeDelete(pendingDeletion.path)}
                    className="text-[11px] text-slate-400 hover:text-red-400 transition-colors"
                  >
                    Now
                  </button>
                </div>
              </div>
            )}

            {/* File List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
              {(isInitialLoading || loadingFiles) && files.length === 0 ? (
                <div className="p-8 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <span className="text-xs">Reading volume contents...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-2">
                  <FileText className="w-8 h-8 text-slate-300 stroke-1" />
                  <p className="font-medium text-slate-600">
                    {searchQuery ? `No files matching "${searchQuery}"` : "No knowledge bases in volume"}
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-[200px] leading-relaxed">
                    {searchQuery
                      ? "Check your spelling or clear the filter."
                      : "Generate a new knowledge base and deploy it to this Databricks volume."}
                  </p>
                </div>
              ) : (
                filteredFiles.map((file) => {
                  const isSelected = selectedFilePath === file.path;
                  const fileName = file.path.split("/").pop() || file.path;
                  const isPending = pendingDeletion?.path === file.path;

                  return (
                    <div
                      key={file.path}
                      onClick={() => !isPending && setSelectedFilePath(file.path)}
                      className={`group p-3 flex items-start justify-between cursor-pointer transition-all text-xs ${
                        isPending
                          ? "bg-slate-100/60 opacity-60 pointer-events-none"
                          : isSelected
                          ? "bg-blue-50/70 border-l-3 border-l-blue-600"
                          : "hover:bg-slate-50 border-l-3 border-l-transparent"
                      }`}
                    >
                      <div className="flex items-start space-x-2.5 min-w-0 flex-1 pr-2">
                        <FileCode
                          className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            isSelected ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`font-mono text-xs truncate leading-snug ${
                              isSelected ? "font-semibold text-blue-900" : "font-medium text-slate-800"
                            }`}
                            title={fileName}
                          >
                            {fileName}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                            <span>{formatFileSize(file.file_size)}</span>
                            <span>•</span>
                            <span>{formatModifiedDate(file.last_modified)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 flex-shrink-0">
                        <button
                          onClick={(e) => promptDeleteConfirmation(e, file.path)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete from Databricks"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Column: Live Document Previewer & Inspector */}
          <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden">
            {!selectedFilePath ? (
              /* Empty State */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/60">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-2xs mb-3">
                  <BookOpen className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Select a Knowledge Base Document
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                  Choose any production document on the left to inspect its live Markdown content, review FAQ tagging, or import it into the workbench for updates.
                </p>
              </div>
            ) : loadingContent ? (
              /* Loading Document */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 space-y-2.5">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-xs font-medium">Fetching verbatim content from Databricks volume...</span>
                <span className="text-[11px] font-mono text-slate-400">{selectedFileName}</span>
              </div>
            ) : contentError ? (
              /* Document Error */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 mb-2">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">Failed to Load Content</h4>
                <p className="text-xs text-slate-500 font-mono mt-1 max-w-md">{contentError}</p>
                <button
                  onClick={() => fetchFileContent(selectedFilePath)}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-2xs"
                >
                  Retry
                </button>
              </div>
            ) : (
              /* Active Document View */
              <div className="flex-1 flex flex-col min-h-0">
                {/* Document Top Toolbar */}
                <div className="h-12 px-6 border-b border-slate-200 bg-white flex items-center justify-between gap-4 flex-nowrap flex-shrink-0 shadow-2xs">
                  {/* File Metadata */}
                  <div className="flex items-center space-x-3 min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center space-x-1.5 min-w-0 flex-shrink">
                      <FileCode className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span
                        className="font-mono text-xs font-semibold text-slate-900 truncate select-all"
                        title={selectedFileName}
                      >
                        {selectedFileName}
                      </span>
                    </div>

                    <div className="hidden xl:flex items-center space-x-2 text-[11px] text-slate-400 font-mono border-l border-slate-200 pl-3 flex-shrink-0">
                      <span>{stats.words.toLocaleString()} words</span>
                      <span>•</span>
                      <span>{stats.lines.toLocaleString()} lines</span>
                      <span>•</span>
                      <span>{formatFileSize(selectedFile?.file_size)}</span>
                    </div>
                  </div>

                  {/* View Controls & Action CTAs (Fixed right, never wrapped or pushed) */}
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {/* View Switcher: Rendered vs Raw */}
                    <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200 text-xs flex-shrink-0">
                      <button
                        onClick={() => setViewMode("preview")}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
                          viewMode === "preview"
                            ? "bg-white text-blue-600 shadow-2xs font-semibold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="Rendered Document View"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Rendered</span>
                      </button>
                      <button
                        onClick={() => setViewMode("source")}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
                          viewMode === "source"
                            ? "bg-white text-blue-600 shadow-2xs font-semibold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="Raw Markdown Source View"
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Raw Markdown</span>
                      </button>
                    </div>

                    {/* Copy Button */}
                    <button
                      onClick={handleCopyMarkdown}
                      className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs flex-shrink-0"
                      title="Copy Verbatim Markdown"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Download Button */}
                    <button
                      onClick={handleDownload}
                      className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs flex-shrink-0"
                      title="Download Markdown File"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {/* Open As Draft Button */}
                    <button
                      onClick={handleOpenAsDraft}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-2xs flex-shrink-0"
                      title="Import into Review Workbench for AI refinement and edits"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                      <span>Edit as Draft</span>
                    </button>
                  </div>
                </div>

                {/* Document Body */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                  {viewMode === "preview" ? (
                    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs max-w-4xl mx-auto overflow-hidden">
                      <MarkdownPreview content={fileContent} />
                    </div>
                  ) : (
                    <div className="bg-[#0b0f17] rounded-2xl border border-[#1a2234] shadow-md max-w-4xl mx-auto overflow-hidden">
                      <div className="px-4 py-2 border-b border-[#1a2234] bg-[#070a11] flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>Verbatim Markdown Source</span>
                        <span>{stats.characters.toLocaleString()} chars</span>
                      </div>
                      <pre className="p-5 text-slate-200 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap select-text">
                        {fileContent}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {fileToDeleteConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center modal-backdrop p-4 animate-in fade-in duration-150"
          onClick={() => setFileToDeleteConfirm(null)}
        >
          <div
            className="rounded-2xl shadow-xl w-full max-w-sm bg-white border border-slate-200 p-5 space-y-3 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-semibold text-slate-900">
              Delete Document from Databricks?
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-mono font-medium text-slate-800 break-all">
                {fileToDeleteConfirm.name}
              </span>
              ?
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              You will have a 7-second grace window to undo before the file is deleted and Knowledge Assistant re-syncs.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setFileToDeleteConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAndStageUndo}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete File</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
