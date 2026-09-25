"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  Upload, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  FileText, 
  Trash2, 
  X, 
  CheckCircle2, 
  Database,
  Clock,
  RotateCcw,
  Info
} from "lucide-react";

function formatFilename(text: string): string {
  let formatted = text;
  if (formatted.endsWith(".md")) {
    formatted = formatted.slice(0, -3);
  }
  formatted = formatted.replace(/[\s.]+/g, "_");
  formatted = formatted.replace(/[^a-zA-Z0-9_-]+/g, "");
  formatted = formatted.replace(/_+/g, "_");
  
  if (!formatted.startsWith("KB_")) {
    formatted = `KB_${formatted}`;
  }
  return `${formatted}.md`;
}

export type UploadStage = 
  | "idle" 
  | "uploading" 
  | "countdown_sync" 
  | "syncing" 
  | "synced" 
  | "sync_skipped" 
  | "error";

export interface DatabricksManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  markdown?: string;
  qualityPassed: boolean;
  isLoading?: boolean;
  currentFilename?: string;
  onUpload?: (override: boolean, customFilename: string) => void;
  onSuccess?: (filename: string) => void;
  onSyncStart?: (filename: string) => void;
  onSyncComplete?: (filename: string) => void;
}

export default function DatabricksManagerModal({
  isOpen,
  onClose,
  title,
  markdown,
  qualityPassed,
  isLoading: externalLoading,
  currentFilename,
  onUpload,
  onSuccess,
  onSyncStart,
  onSyncComplete,
}: DatabricksManagerModalProps) {
  // Modal Navigation & Settings
  const [activeTab, setActiveTab] = useState<"deploy" | "files">("deploy");
  const [kbPath, setKbPath] = useState<string>("/Volumes/agents/default/knowledge_base/google_ai_assistant");
  const [customFilename, setCustomFilename] = useState("");
  const [overrideChecked, setOverrideChecked] = useState(false);

  // Upload & Sync States
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [syncCountdown, setSyncCountdown] = useState<number>(5);
  const [deployedFilename, setDeployedFilename] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Assistant Status
  const [assistantSyncState, setAssistantSyncState] = useState<"UPDATED" | "UPDATING" | "UNKNOWN">("UNKNOWN");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  // File Directory State
  const [files, setFiles] = useState<{ path: string; file_size?: number }[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" } | null>(null);

  // Delete & Undo State
  const [fileToDeleteConfirm, setFileToDeleteConfirm] = useState<{ path: string; name: string } | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<{ path: string; name: string; countdown: number } | null>(null);
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Assistant Sync Status with cache-busting
  const fetchAssistantStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/databricks/sync?_t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const state = data.state || "UNKNOWN";
        setAssistantSyncState(state);
        if (data.knowledge_cutoff_time) {
          setLastSyncTime(new Date(data.knowledge_cutoff_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        if (data.kbPath) {
          setKbPath(data.kbPath);
        }
        return state;
      }
    } catch (err) {
      console.error("Failed to check assistant sync status", err);
    }
    return "UNKNOWN";
  }, []);

  // Fetch Volume Files with cache-busting & simultaneous assistant status refresh
  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      fetchAssistantStatus();
      const res = await fetch(`/api/databricks?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        if (data.kbPath) {
          setKbPath(data.kbPath);
        }
      }
    } catch (err) {
      console.error("Failed to fetch files", err);
    } finally {
      setLoadingFiles(false);
    }
  }, [fetchAssistantStatus]);

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      fetchFiles();
      setCustomFilename(formatFilename(currentFilename || title));
      setUploadStage("idle");
      setUploadError(null);
      setSyncCountdown(5);
      setOverrideChecked(false);
      setFileToDeleteConfirm(null);
      setPendingDeletion(null);
    } else {
      // Clean up timers on close
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen, title, currentFilename, fetchFiles]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fileToDeleteConfirm) {
          setFileToDeleteConfirm(null);
        } else if (uploadStage === "uploading") {
          handleCancelUpload();
        } else {
          onClose();
        }
      }
    };
    if (isOpen) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, fileToDeleteConfirm, uploadStage, onClose]);

  // Polling helper for sync completion
  const pollSyncCompletion = useCallback((targetFileName?: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    
    let attempts = 0;
    const maxAttempts = 40; // 40 * 3s = 120s max

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      const state = await fetchAssistantStatus();
      if (state === "UPDATED") {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setUploadStage("synced");
        setIsManualSyncing(false);
        const name = targetFileName || deployedFilename || customFilename || "File";
        setNotification({
          message: `${name} is synced with Knowledge Assistant.`,
          type: "success",
        });
        if (onSyncComplete) {
          onSyncComplete(name);
        }
      } else if (attempts >= maxAttempts) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setIsManualSyncing(false);
        setUploadStage("synced");
        const name = targetFileName || deployedFilename || customFilename || "File";
        setNotification({
          message: `${name} is synced with Knowledge Assistant.`,
          type: "success",
        });
        if (onSyncComplete) {
          onSyncComplete(name);
        }
      }
    }, 3000);
  }, [fetchAssistantStatus, deployedFilename, customFilename, onSyncComplete]);

  // Start Assistant Sync
  const startAssistantSync = useCallback(async () => {
    setUploadStage("syncing");
    setAssistantSyncState("UPDATING");
    const targetName = deployedFilename || customFilename || "File";
    if (onSyncStart) {
      onSyncStart(targetName);
    }
    try {
      const res = await fetch("/api/databricks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to trigger sync");
      }
      pollSyncCompletion(targetName);
    } catch (err) {
      console.error("Assistant sync failed:", err);
      setUploadError(err instanceof Error ? err.message : "Sync failed");
      setUploadStage("error");
    }
  }, [pollSyncCompletion, deployedFilename, customFilename, onSyncStart]);

  // Manual Sync trigger from header
  const handleManualSync = async () => {
    setIsManualSyncing(true);
    setAssistantSyncState("UPDATING");
    try {
      await fetch("/api/databricks/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      pollSyncCompletion();
    } catch (err) {
      console.error("Manual sync failed:", err);
      setIsManualSyncing(false);
    }
  };

  // Upload Execution
  const handleStartUpload = async () => {
    if (!markdown && onUpload) {
      onUpload(!qualityPassed && overrideChecked, customFilename);
      return;
    }

    setUploadStage("uploading");
    setUploadError(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/databricks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          markdown,
          title,
          filename: customFilename,
          override: !qualityPassed && overrideChecked,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();
      const finalName = customFilename || (data.path ? data.path.split("/").pop() : "document.md");
      setDeployedFilename(finalName);
      if (onSuccess) onSuccess(finalName);
      fetchFiles();

      // Transition to auto-sync grace countdown
      setSyncCountdown(5);
      setUploadStage("countdown_sync");
      
      let count = 5;
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      syncTimerRef.current = setInterval(() => {
        count -= 1;
        setSyncCountdown(count);
        if (count <= 0) {
          if (syncTimerRef.current) clearInterval(syncTimerRef.current);
          startAssistantSync();
        }
      }, 1000);

    } catch (err: any) {
      if (err.name === "AbortError") {
        setUploadStage("idle");
        setNotification({ message: "Upload cancelled.", type: "info" });
        setTimeout(() => setNotification(null), 3000);
      } else {
        console.error("Upload error:", err);
        setUploadError(err.message || "Failed to upload file");
        setUploadStage("error");
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Cancel in-flight upload
  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploadStage("idle");
  };

  // Skip Assistant Sync
  const handleSkipSync = () => {
    if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    setUploadStage("sync_skipped");
  };

  // Prompt delete warning dialog
  const promptDeleteConfirmation = (path: string) => {
    const name = path.split("/").pop() || path;
    setFileToDeleteConfirm({ path, name });
  };

  // Confirm delete -> Start 7s grace period
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
      setPendingDeletion(prev => prev ? { ...prev, countdown: count } : null);
      if (count <= 0) {
        if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
        executeDelete(path);
      }
    }, 1000);
  };

  // Undo delete
  const handleUndoDelete = () => {
    if (deleteTimerRef.current) clearInterval(deleteTimerRef.current);
    setPendingDeletion(null);
    setNotification({
      message: "Deletion cancelled. File was preserved.",
      type: "success"
    });
    setTimeout(() => setNotification(null), 3500);
  };

  // Execute actual deletion and trigger auto-sync
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
        fetchFiles();
        setNotification({
          message: "File deleted. Auto-syncing Knowledge Assistant...",
          type: "info"
        });
        setTimeout(() => setNotification(null), 4000);

        setAssistantSyncState("UPDATING");
        fetch("/api/databricks/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }).then(() => {
          pollSyncCompletion("Deleted file");
        }).catch(err => {
          console.error("Auto-sync after delete failed:", err);
        });
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-xl bg-white border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900 leading-tight">
                  Databricks Knowledge Base
                </h3>
                {/* Subtle Status Indicator */}
                <div 
                  className="flex items-center gap-1.5 text-xs select-none"
                  title={lastSyncTime ? `Last indexed at ${lastSyncTime}` : "Assistant status"}
                >
                  {assistantSyncState === "UPDATING" || isManualSyncing ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-[11px] text-slate-500 font-medium">Syncing assistant...</span>
                    </>
                  ) : assistantSyncState === "UPDATED" ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] text-slate-500 font-medium">Assistant in sync</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      <span className="text-[11px] text-slate-400">Ready</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-sm mt-0.5">
                {kbPath}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global Notification Banner (Clean Dark Floating Bar) */}
        {notification && (
          <div className="mx-4 mt-3 px-3 py-2 text-xs rounded-xl flex items-center justify-between gap-2.5 bg-slate-900 text-white shadow-sm animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="truncate text-slate-200">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-slate-100 flex items-center justify-between text-xs font-medium bg-white">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("deploy")}
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "deploy"
                  ? "border-blue-600 text-blue-600 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Deploy Current KB</span>
            </button>
            <button
              onClick={() => setActiveTab("files")}
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "files"
                  ? "border-blue-600 text-blue-600 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Live Directory</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
                {files.length}
              </span>
            </button>
          </div>

          {activeTab === "files" && (
            <button
              onClick={handleManualSync}
              disabled={isManualSyncing || assistantSyncState === "UPDATING"}
              className="mb-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition-colors disabled:opacity-50"
              title="Trigger Knowledge Assistant vector index sync"
            >
              <RefreshCw className={`w-3 h-3 ${isManualSyncing || assistantSyncState === "UPDATING" ? "animate-spin" : ""}`} />
              <span>Sync Assistant</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === "deploy" ? (
            <div className="space-y-4">
              
              {/* Form Input: Always accessible or clearly state-aware */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Target Filename (.md)
                </label>
                <input
                  type="text"
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  disabled={uploadStage === "uploading"}
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-slate-800 disabled:opacity-60"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Prefix KB_ will automatically be standardized if omitted.
                </p>
              </div>

              {!qualityPassed && uploadStage === "idle" && (
                <div className="rounded-xl p-3.5 bg-amber-50 border border-amber-200/80 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-amber-900 leading-tight">
                      Quality Audit Threshold Not Met
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      This document has not passed all automated RITA standards (score &lt; 75). Ensure you have verified its contents.
                    </p>
                    <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={overrideChecked}
                        onChange={(e) => setOverrideChecked(e.target.checked)}
                        className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-medium text-amber-900">
                        Override and deploy anyway
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* ACTION / PROGRESS STATES */}

              {/* STAGE: IDLE */}
              {uploadStage === "idle" && (
                <div className="pt-2">
                  <button
                    onClick={handleStartUpload}
                    disabled={externalLoading || (!qualityPassed && !overrideChecked)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs hover:brightness-105"
                    style={{
                      background: !qualityPassed
                        ? "#f59e0b"
                        : "linear-gradient(135deg, #2563eb, #4f46e5)",
                    }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Deploy to Databricks Volume</span>
                  </button>
                </div>
              )}

              {/* STAGE: UPLOADING */}
              {uploadStage === "uploading" && (
                <div className="rounded-xl p-3.5 bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between animate-in fade-in duration-150">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <div>
                      <p className="text-xs font-medium text-slate-800">Writing to volume...</p>
                      <p className="text-[11px] text-slate-400 font-mono">{customFilename}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleCancelUpload}
                    className="text-xs font-medium text-slate-500 hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* STAGE: COUNTDOWN SYNC (UPLOADED -> 5s AUTO SYNC GRACE) */}
              {uploadStage === "countdown_sync" && (
                <div className="rounded-xl p-3.5 bg-white border border-slate-200/90 shadow-2xs space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>File saved to Databricks volume</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Auto-sync in {syncCountdown}s
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {deployedFilename}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Auto-sync will start in {syncCountdown}s. Syncing takes a while (typically 1–2 minutes), and a notification will appear once it&apos;s done.
                  </p>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={startAssistantSync}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-2xs flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Sync Assistant Now</span>
                    </button>
                    <button
                      onClick={handleSkipSync}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Skip Sync
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE: SYNCING (NON-BLOCKING) */}
              {uploadStage === "syncing" && (
                <div className="rounded-xl p-3.5 bg-white border border-slate-200/90 shadow-2xs space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span>File uploaded. Syncing Knowledge Assistant...</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {deployedFilename}
                  </p>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <p className="font-medium text-slate-700">
                      Syncing takes a while (typically 1–2 minutes).
                    </p>
                    <p className="text-slate-500 leading-relaxed">
                      You can safely close this modal or continue working. A notification will appear once it&apos;s done.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => setActiveTab("files")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>View in Live Directory</span>
                    </button>
                    <button
                      onClick={onClose}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-2xs"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE: SYNCED */}
              {uploadStage === "synced" && (
                <div className="rounded-xl p-3.5 bg-white border border-slate-200/90 shadow-2xs space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>File uploaded & Knowledge Assistant in sync</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {deployedFilename}
                  </p>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => setActiveTab("files")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>View in Live Directory</span>
                    </button>
                    <button
                      onClick={onClose}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-2xs"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE: SYNC SKIPPED */}
              {uploadStage === "sync_skipped" && (
                <div className="rounded-xl p-3.5 bg-white border border-slate-200/90 shadow-2xs space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
                    <Info className="w-4 h-4 text-slate-500" />
                    <span>File saved to volume (Assistant sync skipped)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {deployedFilename}
                  </p>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={startAssistantSync}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Sync Assistant Now</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("files")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      View in Directory
                    </button>
                    <button
                      onClick={onClose}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE: ERROR */}
              {uploadStage === "error" && (
                <div className="rounded-xl p-3.5 bg-red-50/70 border border-red-200 space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-950">Operation Failed</p>
                      <p className="text-[11px] text-red-800 font-mono break-all mt-0.5">
                        {uploadError || "An unexpected error occurred."}
                      </p>
                    </div>
                  </div>
                  <div className="pt-1">
                    <button
                      onClick={() => setUploadStage("idle")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-2xs"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            /* TAB: LIVE DIRECTORY */
            <div className="space-y-3">
              
              {/* STAGED UNDO NOTIFICATION (DARK SNACKBAR PATTERN) */}
              {pendingDeletion && (
                <div className="rounded-xl p-2.5 px-3 bg-slate-900 text-white flex items-center justify-between gap-3 shadow-sm text-xs animate-in slide-in-from-top-1 duration-150">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="truncate">
                      Deleting <strong className="font-mono text-slate-200">{pendingDeletion.name}</strong> in {pendingDeletion.countdown}s
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <button
                      onClick={handleUndoDelete}
                      className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Undo</span>
                    </button>
                    <button
                      onClick={() => executeDelete(pendingDeletion.path)}
                      className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                    >
                      Delete Now
                    </button>
                  </div>
                </div>
              )}

              {/* Directory Header Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-700">Files in Volume</span>
                  <span className="text-[11px] font-mono text-slate-400">({files.length})</span>
                </div>
                <button
                  onClick={fetchFiles}
                  disabled={loadingFiles}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Refresh File List"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* File List */}
              {loadingFiles && files.length === 0 ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : files.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                  No files found in this volume.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {files.map((file) => {
                    const fileName = file.path.split("/").pop() || file.path;
                    const isPending = pendingDeletion?.path === file.path;

                    return (
                      <div
                        key={file.path}
                        className={`p-2.5 flex items-center justify-between transition-colors text-xs ${
                          isPending 
                            ? "bg-slate-100/60 opacity-60" 
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isPending ? "text-slate-400" : "text-slate-400"}`} />
                          <span className={`font-mono truncate ${isPending ? "line-through text-slate-400" : "text-slate-800"}`}>
                            {fileName}
                          </span>
                          {file.file_size && (
                            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                              {(file.file_size / 1024).toFixed(1)} KB
                            </span>
                          )}
                          {isPending && (
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full flex-shrink-0">
                              Pending ({pendingDeletion.countdown}s)
                            </span>
                          )}
                        </div>

                        {!isPending ? (
                          <button
                            onClick={() => promptDeleteConfirmation(file.path)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                            title="Delete File"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={handleUndoDelete}
                            className="p-1 text-blue-600 hover:text-blue-800 rounded transition-colors"
                            title="Reinstate File"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            {lastSyncTime ? `Last assistant sync: ${lastSyncTime}` : null}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* DELETE CONFIRMATION WARNING MODAL (CLEAN WHITE CARD STYLE) */}
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
              Delete File from Databricks?
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete <span className="font-mono font-medium text-slate-800 break-all">{fileToDeleteConfirm.name}</span>?
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              You will have a 7-second grace window to undo before the file is deleted and the Knowledge Assistant re-syncs.
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
