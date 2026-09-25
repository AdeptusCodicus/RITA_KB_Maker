"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  Code,
  Sparkles,
  Sparkle,
  LogOut,
  Save,
  Trash2,
  Send,
  Undo2,
  Redo2,
  Columns2,
  Copy,
  Check,
  Tag,
  ShieldAlert,
  Clock,
  ExternalLink,
  FileText,
  RotateCcw,
  Zap,
  Plus,
  Scissors,
  BookOpen,
  X,
} from "lucide-react";
import type { QualityReport } from "@/types/kb";
import { saveDraft, deleteDraft, getActiveDraftId } from "@/lib/drafts";
import Sidebar from "@/components/Sidebar";
import DatabricksManagerModal from "@/components/DatabricksManagerModal";

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 65) return "#f59e0b";
  return "#ef4444";
}

function statusDot(status: "pass" | "warn" | "fail"): string {
  if (status === "pass") return "#10b981";
  if (status === "warn") return "#f59e0b";
  return "#ef4444";
}

/* ── Circular Gauge Component ────────────────────────────────────────────────── */

function ScoreRing({
  score,
  grade,
  size = 100,
}: {
  score: number;
  grade: string;
  size?: number;
}) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} className="score-ring">
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <circle
          className="score-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={scoreColor(score)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span
          className="text-2xl font-bold tracking-tight"
          style={{ color: scoreColor(score) }}
        >
          {grade}
        </span>
        <span className="text-[10px] text-slate-400 font-mono">
          {score}/100
        </span>
      </div>
    </div>
  );
}

/* ── Exit Modal Component ───────────────────────────────────────────────────── */

function ExitModal({
  isOpen,
  onClose,
  onSaveDraft,
  onDiscard,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaveDraft: () => void;
  onDiscard: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 bg-white border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900 mb-1.5">
          Exit Review Workbench?
        </h3>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Save your knowledge base as a draft to resume later, or discard your current edits.
        </p>

        <div className="space-y-2">
          <button
            onClick={onSaveDraft}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            Save Draft & Exit
          </button>

          <button
            onClick={onDiscard}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 transition-colors border border-red-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Discard Changes
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            Continue Editing
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Markdown Custom Preview Renderer ────────────────────────────────────────── */

function MarkdownPreview({ content }: { content: string }) {
  const components = useMemo(
    () => ({
      p: ({ children }: any) => {
        const text = String(children);
        // Detect RITA One-Step Wait Gate lines
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
        // Detect Action Tokens: [[TOKEN_NAME:...]]
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
    <div className="preview-content p-6 sm:p-8 max-w-3xl mx-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* ── Main Review Workbench Page ──────────────────────────────────────────────── */

export default function ReviewPage() {
  const router = useRouter();
  const [extractedText, setExtractedText] = useState("");
  const [kbMarkdown, setKbMarkdown] = useState("");
  const [filename, setFilename] = useState("");
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [isQualityLoading, setIsQualityLoading] = useState(false);

  // Workbench layout states
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(true);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
  const [editorViewMode, setEditorViewMode] = useState<"edit" | "preview" | "split">("edit");
  const [copiedSource, setCopiedSource] = useState(false);

  // Modal & Toast states
  const [showDatabricksModal, setShowDatabricksModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Refinement state
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [activeRefiningInstruction, setActiveRefiningInstruction] = useState<string | null>(null);

  // Quality audit error and auto-retry state
  const [auditError, setAuditError] = useState<{
    message: string;
    isCapacity: boolean;
    retryCountdown?: number | null;
  } | null>(null);
  const auditCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const [initialAuditPending, setInitialAuditPending] = useState(false);

  const cancelAuditCountdown = useCallback(() => {
    if (auditCountdownRef.current) {
      clearInterval(auditCountdownRef.current);
      auditCountdownRef.current = null;
    }
    setAuditError((prev) => (prev ? { ...prev, retryCountdown: null } : null));
  }, []);

  useEffect(() => {
    return () => {
      if (auditCountdownRef.current) {
        clearInterval(auditCountdownRef.current);
      }
    };
  }, []);

  // Version History Stack (Undo / Redo)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(0);
  const kbMarkdownRef = useRef<string>("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isMac, setIsMac] = useState(true);

  // Detect OS for keyboard shortcuts and tooltips
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    if (/Windows|Win32|Win64|Linux|X11|Android/i.test(ua)) {
      setIsMac(false);
      return;
    }
    if (/Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua)) {
      setIsMac(true);
      return;
    }
    const platform = (navigator as unknown as { platform?: string }).platform || "";
    if (/Win|Linux/i.test(platform)) {
      setIsMac(false);
      return;
    }
    if (/Mac/i.test(platform)) {
      setIsMac(true);
      return;
    }
    setIsMac(false);
  }, []);

  // Sync mutable refs with current state
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    kbMarkdownRef.current = kbMarkdown;
  }, [kbMarkdown]);

  // Load from session storage
  useEffect(() => {
    const text = sessionStorage.getItem("kb_extracted_text");
    const md = sessionStorage.getItem("kb_markdown");
    const fn = sessionStorage.getItem("kb_filename");
    const qr = sessionStorage.getItem("kb_quality_report");
    const pendingAudit = sessionStorage.getItem("kb_audit_pending") === "true";

    if (!text || !md) {
      router.push("/");
      return;
    }

    setExtractedText(text);
    setKbMarkdown(md);
    kbMarkdownRef.current = md;
    setHistory([md]);
    setHistoryIndex(0);
    historyRef.current = [md];
    historyIndexRef.current = 0;
    setFilename(fn || "document");

    if (qr) {
      try {
        setQualityReport(JSON.parse(qr));
      } catch {
        // Ignore JSON error
      }
    } else if (pendingAudit) {
      setInitialAuditPending(true);
    }
  }, [router]);

  // Extract KB title
  const kbTitle = useMemo(() => {
    const match = kbMarkdown.match(/^#\s+(.+)$/m);
    if (match?.[1]) return match[1].trim();
    const base = filename.replace(/\.[^.]+$/, "");
    return base.charAt(0).toUpperCase() + base.slice(1);
  }, [kbMarkdown, filename]);

  // Record a new checkpoint snapshot in the history stack
  const pushHistorySnapshot = useCallback((newText: string) => {
    const currentHist = historyRef.current;
    const currentIdx = historyIndexRef.current;

    // Skip if identical to current snapshot
    if (currentHist[currentIdx] === newText) {
      return;
    }

    // Branch history from current point
    const nextHistory = [...currentHist.slice(0, currentIdx + 1), newText];
    if (nextHistory.length > 50) {
      nextHistory.shift();
    }
    const newIdx = nextHistory.length - 1;

    historyRef.current = nextHistory;
    historyIndexRef.current = newIdx;
    setHistory(nextHistory);
    setHistoryIndex(newIdx);
  }, []);

  // Handle Manual Editing with debounced history snapshots
  const handleMarkdownChange = (newText: string) => {
    setKbMarkdown(newText);
    kbMarkdownRef.current = newText;
    sessionStorage.setItem("kb_markdown", newText);

    // Debounce history snapshot so pauses in typing create clear undo checkpoints
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      pushHistorySnapshot(newText);
    }, 700);
  };

  // Immediate snapshot when editor loses focus
  const handleEditorBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pushHistorySnapshot(kbMarkdownRef.current);
  };

  // Undo / Redo controls
  const handleUndo = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    let currentHist = [...historyRef.current];
    let currentIdx = historyIndexRef.current;
    const currentMd = kbMarkdownRef.current;

    // If there are unsaved/pending changes in the editor different from current history snapshot
    if (currentHist.length > 0 && currentMd !== currentHist[currentIdx]) {
      // Branch and commit the current text first so Redo can bring it back
      const nextHistory = [...currentHist.slice(0, currentIdx + 1), currentMd];
      if (nextHistory.length > 50) nextHistory.shift();
      currentHist = nextHistory;
      currentIdx = nextHistory.length - 1;
      historyRef.current = currentHist;
      historyIndexRef.current = currentIdx;
      setHistory(currentHist);
      setHistoryIndex(currentIdx);
    }

    // Step back one snapshot if possible
    if (currentIdx > 0) {
      const targetIndex = currentIdx - 1;
      const targetMd = currentHist[targetIndex];
      historyIndexRef.current = targetIndex;
      setHistoryIndex(targetIndex);
      setKbMarkdown(targetMd);
      kbMarkdownRef.current = targetMd;
      sessionStorage.setItem("kb_markdown", targetMd);
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const currentIdx = historyIndexRef.current;
    const currentHist = historyRef.current;

    if (currentIdx < currentHist.length - 1) {
      const targetIndex = currentIdx + 1;
      const targetMd = currentHist[targetIndex];
      historyIndexRef.current = targetIndex;
      setHistoryIndex(targetIndex);
      setKbMarkdown(targetMd);
      kbMarkdownRef.current = targetMd;
      sessionStorage.setItem("kb_markdown", targetMd);
    }
  }, []);

  // Keyboard shortcut listener for Undo (⌘Z / Ctrl+Z) and Redo (⌘⇧Z / Ctrl+Shift+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Do not intercept if user is typing in standard single-line text inputs (like search or prompt box)
      if (target?.tagName === "INPUT") return;

      const ua = navigator.userAgent || "";
      const isMacUser =
        /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua) ||
        (!/Windows|Win32|Win64|Linux|X11|Android/i.test(ua) &&
          /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || ""));
      const isMod = isMacUser ? e.metaKey : e.ctrlKey;

      if (!isMod) return;

      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === "z" && e.shiftKey) || (!isMacUser && key === "y")) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Derived undo/redo capability states
  const hasDiverged = history.length > 0 && kbMarkdown !== history[historyIndex];
  const canUndo = historyIndex > 0 || hasDiverged;
  const canRedo = !hasDiverged && historyIndex < history.length - 1;

  // Run Quality Check
  const runQualityCheck = useCallback(
    async (overrideMd?: string, isAutoRetry = false) => {
      cancelAuditCountdown();
      setIsQualityLoading(true);
      const mdToCheck = typeof overrideMd === "string" ? overrideMd : kbMarkdown;
      try {
        const res = await fetch("/api/quality-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: mdToCheck }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const isCapacity = Boolean(errData.isCapacity) || res.status === 503 || res.status === 429;
          const errMsg = errData.error || (isCapacity ? "Google AI request queue is currently at capacity." : "Quality audit failed");

          setAuditError({
            message: errMsg,
            isCapacity,
            retryCountdown: isCapacity && !isAutoRetry ? 5 : null,
          });

          if (isCapacity && !isAutoRetry) {
            let count = 5;
            auditCountdownRef.current = setInterval(() => {
              count -= 1;
              if (count <= 0) {
                if (auditCountdownRef.current) {
                  clearInterval(auditCountdownRef.current);
                  auditCountdownRef.current = null;
                }
                setAuditError((prev) => (prev ? { ...prev, retryCountdown: null } : null));
                runQualityCheck(mdToCheck, true);
              } else {
                setAuditError((prev) => (prev ? { ...prev, retryCountdown: count } : null));
              }
            }, 1000);
          }
          return;
        }

        const report = await res.json();
        setQualityReport(report);
        setAuditError(null);
        setInitialAuditPending(false);
        sessionStorage.removeItem("kb_audit_pending");
        sessionStorage.setItem("kb_quality_report", JSON.stringify(report));
      } catch (err: any) {
        console.error("Quality check failed", err);
        const isCap = String(err?.message || "").toLowerCase().includes("capacity") || String(err?.message || "").toLowerCase().includes("queue");
        setAuditError({
          message: isCap ? "Google AI request queue is currently at capacity." : (err?.message || "Audit connection failed"),
          isCapacity: isCap,
          retryCountdown: null,
        });
      } finally {
        setIsQualityLoading(false);
      }
    },
    [cancelAuditCountdown, kbMarkdown]
  );

  // AI Refine KB
  const handleRefineKB = async (customInstruction?: string) => {
    const instructions = (customInstruction || refinementPrompt).trim();
    if (!instructions || isRefining) return;

    // Flush any pending debounce snapshot before refining so user edits are preserved in history
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pushHistorySnapshot(kbMarkdownRef.current);

    const isCustom = Boolean(customInstruction);
    if (!isCustom) {
      setRefinementPrompt("");
    }
    setActiveRefiningInstruction(instructions);
    setIsRefining(true);

    let updatedMd = "";

    try {
      const res = await fetch("/api/refine-kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: kbMarkdownRef.current,
          instructions,
          originalText: extractedText,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const isCap = Boolean(err.isCapacity) || res.status === 503 || res.status === 429;
        const errObj = new Error(err.error || (isCap ? "Google AI request queue is currently at capacity." : "Refinement failed"));
        (errObj as any).isCapacity = isCap;
        throw errObj;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

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
                const dataStr = line.slice(6).trim();
                if (dataStr === "[DONE]") {
                  done = true;
                  break;
                }
                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.text) {
                    updatedMd += parsed.text;
                    setKbMarkdown(updatedMd);
                    kbMarkdownRef.current = updatedMd;
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

      if (updatedMd) {
        setKbMarkdown(updatedMd);
        kbMarkdownRef.current = updatedMd;
        sessionStorage.setItem("kb_markdown", updatedMd);

        // Push refined version to history stack
        pushHistorySnapshot(updatedMd);

        setToast({ message: "Knowledge base refined successfully!", type: "success" });
        setTimeout(() => setToast(null), 4000);

        // Automatically re-run quality check
        runQualityCheck(updatedMd);
      }
    } catch (error: any) {
      if (!isCustom) {
        setRefinementPrompt(instructions);
      }
      const isCapacity =
        Boolean(error?.isCapacity) ||
        String(error?.message || "").toLowerCase().includes("capacity") ||
        String(error?.message || "").toLowerCase().includes("queue") ||
        String(error?.message || "").includes("503") ||
        String(error?.message || "").includes("429");

      setToast({
        message: isCapacity
          ? "AI service is currently at peak capacity. Please wait a moment and try refining again."
          : `Refinement failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        type: isCapacity ? "info" : "error",
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsRefining(false);
      setActiveRefiningInstruction(null);
    }
  };

  // Exit & Save Draft
  const handleSaveDraftAndExit = () => {
    const activeId = getActiveDraftId() || undefined;
    saveDraft({
      id: activeId,
      title: kbTitle,
      filename,
      extractedText,
      markdown: kbMarkdown,
      qualityReport,
    });
    sessionStorage.clear();
    router.push("/");
  };

  // Exit & Discard
  const handleDiscardAndExit = () => {
    const activeId = getActiveDraftId();
    if (activeId) {
      deleteDraft(activeId);
    }
    sessionStorage.clear();
    router.push("/");
  };

  // Copy Source Text
  const copySourceText = () => {
    navigator.clipboard.writeText(extractedText);
    setCopiedSource(true);
    setTimeout(() => setCopiedSource(false), 2000);
  };

  if (!extractedText && !kbMarkdown) {
    return (
      <div className="flex h-screen bg-[#fafbfc]">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Workbench Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white border-l border-slate-200/80">
        {/* Top Control Bar */}
        <header className="h-14 border-b border-slate-200/80 px-4 sm:px-5 flex items-center justify-between bg-white flex-shrink-0 select-none gap-3">
          {/* Left: Source Drawer Toggle & Document Title */}
          <div className="flex items-center gap-2.5 min-w-0 flex-shrink">
            <button
              onClick={() => setLeftDrawerOpen(!leftDrawerOpen)}
              className={`h-8 px-2.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${
                leftDrawerOpen
                  ? "bg-slate-100 border-slate-300 text-slate-800 shadow-2xs"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              title="Toggle Source Document Panel"
            >
              <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-200 ${!leftDrawerOpen ? "rotate-180" : ""}`} />
              <span className="hidden sm:inline">Source</span>
            </button>

            <div className="h-4 w-px bg-slate-200 flex-shrink-0 hidden sm:block" />

            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-xs sm:text-sm font-semibold text-slate-900 truncate max-w-[200px] sm:max-w-[320px] md:max-w-[420px] leading-none">
                {kbTitle}
              </h1>
            </div>
          </div>

          {/* Center: View Mode Segmented Switcher & Revision Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* View Mode Segmented Control */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-xs">
              <button
                onClick={() => setEditorViewMode("edit")}
                className={`flex items-center gap-1.5 h-7 px-3 rounded-md transition-all ${
                  editorViewMode === "edit"
                    ? "bg-white text-slate-800 shadow-2xs font-medium"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Code className="w-3 h-3" />
                <span>Edit</span>
              </button>
              <button
                onClick={() => setEditorViewMode("preview")}
                className={`flex items-center gap-1.5 h-7 px-3 rounded-md transition-all ${
                  editorViewMode === "preview"
                    ? "bg-white text-slate-800 shadow-2xs font-medium"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Preview</span>
              </button>
              <button
                onClick={() => setEditorViewMode("split")}
                className={`hidden md:flex items-center gap-1.5 h-7 px-3 rounded-md transition-all ${
                  editorViewMode === "split"
                    ? "bg-white text-slate-800 shadow-2xs font-medium"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Columns2 className="w-3 h-3" />
                <span>Split</span>
              </button>
            </div>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            {/* Undo / Redo controls */}
            <div className="flex items-center border border-slate-200/60 rounded-lg p-0.5 bg-slate-50 text-xs">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                title={canUndo ? `Undo (${isMac ? "⌘Z" : "Ctrl+Z"})` : `Undo (${isMac ? "⌘Z" : "Ctrl+Z"})`}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <span
                className="text-[10px] font-mono px-1.5 text-slate-400 select-none"
                title={`Version ${historyIndex + 1} of ${Math.max(history.length, 1)}`}
              >
                v{historyIndex + 1}{history.length > 1 ? `/${history.length}` : ""}
              </span>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                title={canRedo ? `Redo (${isMac ? "⌘⇧Z" : "Ctrl+Y"})` : `Redo (${isMac ? "⌘⇧Z" : "Ctrl+Y"})`}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right: Scorecard, Databricks Deploy & Exit Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Audit / Scorecard Trigger */}
            <button
              onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
              className={`h-8 px-2.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 ${
                rightDrawerOpen
                  ? "bg-slate-100 border-slate-300 text-slate-800 shadow-2xs"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              title="Toggle Quality Audit Scorecard"
            >
              <span>Scorecard</span>
              {qualityReport ? (
                <span
                  className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-md"
                  style={{
                    background: qualityReport.passed ? "#dcfce7" : "#fef3c7",
                    color: qualityReport.passed ? "#166534" : "#92400e",
                  }}
                >
                  {qualityReport.overall_score}
                </span>
              ) : null}
              <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${rightDrawerOpen ? "rotate-180" : ""}`} />
            </button>

            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            {/* Primary Action: Deploy to Databricks */}
            <button
              onClick={() => setShowDatabricksModal(true)}
              className="h-8 px-3 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-2xs flex items-center gap-1.5 flex-shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Upload to</span>
              <span>Databricks</span>
            </button>

            {/* Exit Workbench Button */}
            <button
              onClick={() => setShowExitModal(true)}
              className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center flex-shrink-0"
              title="Exit Workbench"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Quality Banner if not passed */}
        {qualityReport && !qualityReport.passed && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Quality Alert:</strong> Score is {qualityReport.overall_score}/100 (Pass threshold: 75). Review the scorecard suggestions before uploading.
              </span>
            </div>
            <button
              onClick={() => setRightDrawerOpen(true)}
              className="underline font-medium hover:text-amber-900"
            >
              View Findings
            </button>
          </div>
        )}

        {/* Three Panel Workbench Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Drawer — Source Document */}
          {leftDrawerOpen && (
            <div className="w-72 sm:w-80 flex-shrink-0 flex flex-col border-r border-slate-200 bg-slate-50/50">
              <div className="p-3 border-b border-slate-200 bg-slate-100/60 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Raw Extracted Source
                  </span>
                  <button
                    onClick={copySourceText}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors"
                    title="Copy Extracted Text"
                  >
                    {copiedSource ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 min-w-0 bg-white/90 border border-slate-200/80 rounded-md px-2 py-1 shadow-2xs">
                  <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-[11px] font-mono text-slate-700 truncate select-all" title={filename}>
                    {filename}
                  </span>
                </div>
              </div>
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar font-mono text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap select-text">
                {extractedText}
              </div>
            </div>
          )}

          {/* Center Canvas — Editor / Preview */}
          <div className="flex-1 flex flex-col min-w-0 bg-white relative">
            {/* Refinement Full-Canvas Overlay with Shimmering Badge Animation */}
            {isRefining && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/75 backdrop-blur-[2px] transition-all animate-in fade-in duration-200 select-none">
                <div className="flex flex-col items-center p-6 max-w-sm mx-auto text-center">
                  {/* Shimmering Badge matching user screenshot */}
                  <div className="relative w-14 h-14 mb-3 flex items-center justify-center">
                    {/* Ambient outer pulse glow */}
                    <div className="absolute inset-0 rounded-full bg-blue-500/25 blur-md animate-pulse" />

                    {/* Circular Blue Badge Container */}
                    <div className="relative w-full h-full rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30 overflow-hidden">
                      {/* Diagonal Shimmer Light Reflection Sweep */}
                      <div className="absolute inset-0 -translate-x-full animate-shimmer-sweep bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none" />

                      {/* White Sparkles Glyph (Center Star, NE Cross, SW Dot) */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-7 h-7 text-white drop-shadow-sm relative z-10"
                      >
                        {/* Main 4-point star */}
                        <path
                          d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
                          className="animate-sparkle-center"
                        />
                        {/* Top-Right (NE) Plus Cross */}
                        <path d="M20 2v4" className="animate-sparkle-cross" />
                        <path d="M22 4h-4" className="animate-sparkle-cross" />
                        {/* Bottom-Left (SW) Circle */}
                        <circle cx="4" cy="20" r="1.8" className="animate-sparkle-dot" />
                      </svg>
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-slate-800 tracking-tight">
                    Refining Knowledge Base
                  </p>
                  {activeRefiningInstruction && (
                    <p className="text-xs text-slate-500 italic mt-1 line-clamp-2 max-w-xs leading-relaxed">
                      "{activeRefiningInstruction}"
                    </p>
                  )}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-blue-50/90 text-blue-600 border border-blue-100/90 mt-3 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                    Synthesizing updates...
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
              {/* Edit Mode / Left Split */}
              {(editorViewMode === "edit" || editorViewMode === "split") && (
                <div className={`flex-1 flex flex-col overflow-hidden ${editorViewMode === "split" ? "border-r border-slate-200" : ""}`}>
                  <textarea
                    value={kbMarkdown}
                    onChange={(e) => handleMarkdownChange(e.target.value)}
                    onBlur={handleEditorBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const target = e.currentTarget;
                        const start = target.selectionStart;
                        const end = target.selectionEnd;
                        const val = target.value;
                        const updated = val.substring(0, start) + "  " + val.substring(end);
                        handleMarkdownChange(updated);
                        requestAnimationFrame(() => {
                          target.selectionStart = target.selectionEnd = start + 2;
                        });
                      }
                    }}
                    placeholder="# Enter Knowledge Base content..."
                    className="w-full h-full p-6 font-mono text-xs text-slate-800 leading-relaxed border-0 outline-none resize-none custom-scrollbar bg-transparent select-text"
                    spellCheck={false}
                  />
                </div>
              )}

              {/* Preview Mode / Right Split */}
              {(editorViewMode === "preview" || editorViewMode === "split") && (
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#ffffff]">
                  <MarkdownPreview content={kbMarkdown} />
                </div>
              )}
            </div>

            {/* AI Refinement Floating Dock */}
            <div className="p-3 border-t border-slate-200/80 bg-slate-50/80 backdrop-blur-sm">
              {/* Quick Prompt Suggestion Chips */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2 overflow-x-auto custom-scrollbar pb-0.5">
                {[
                  { label: "Enforce One-Step Rule", icon: Zap },
                  { label: "Add Escalation Step", icon: Plus },
                  { label: "Shorten FAQ Answers", icon: Scissors },
                  { label: "Add Kebab Tags", icon: Tag },
                  { label: "Add Glossary Definition", icon: BookOpen },
                ].map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => handleRefineKB(label)}
                    disabled={isRefining}
                    className="text-[10px] font-medium px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors shadow-2xs whitespace-nowrap disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Icon className="w-3 h-3 text-slate-400" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Prompt Input Bar */}
              <div
                className={`flex items-center gap-2 bg-white rounded-xl border px-3 py-1.5 shadow-2xs transition-all ${
                  isRefining
                    ? "border-blue-400/80 ring-2 ring-blue-100 bg-blue-50/20"
                    : "border-slate-300/80 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"
                }`}
              >
                <Sparkles
                  className={`w-4 h-4 text-blue-500 flex-shrink-0 ${
                    isRefining ? "animate-spin text-blue-600" : ""
                  }`}
                />
                <input
                  type="text"
                  value={refinementPrompt}
                  onChange={(e) => setRefinementPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleRefineKB();
                    }
                  }}
                  placeholder={
                    isRefining
                      ? `Refining: "${activeRefiningInstruction}"...`
                      : "Ask AI to refine this KB (e.g. 'Format workflow into 3 atomic steps', 'Update tags')..."
                  }
                  className="flex-1 text-xs text-slate-800 placeholder-slate-400 outline-none bg-transparent"
                  disabled={isRefining}
                />
                <button
                  onClick={() => handleRefineKB()}
                  disabled={!refinementPrompt.trim() || isRefining}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-2xs"
                >
                  {isRefining ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Refining...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>Refine</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Drawer — Quality Scorecard */}
          {rightDrawerOpen && (
            <div className="w-80 lg:w-96 flex-shrink-0 flex flex-col border-l border-slate-200 bg-slate-50/50">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-100/60">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Quality Audit Report
                </span>
                <button
                  onClick={() => runQualityCheck()}
                  disabled={isQualityLoading}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors"
                  title="Re-run Audit"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isQualityLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-5 custom-scrollbar">
                {/* Audit Error / Capacity Notification Card */}
                {auditError && (
                  <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3.5 space-y-2 text-xs animate-in fade-in duration-200 shadow-2xs">
                    <div className="flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-amber-950">
                          {auditError.isCapacity ? "AI Auditor at Peak Capacity" : "Quality Audit Failed"}
                        </p>
                        <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                          {auditError.message}
                        </p>
                        {auditError.retryCountdown !== null && auditError.retryCountdown !== undefined ? (
                          <p className="text-[11px] font-medium text-amber-900 mt-1.5 flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                            <span>Retrying audit in <strong>{auditError.retryCountdown}s</strong>...</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => runQualityCheck()}
                        disabled={isQualityLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-40 transition-all shadow-2xs"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry Audit</span>
                      </button>
                      <button
                        onClick={() => cancelAuditCountdown()}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {/* Initial Audit Queued Banner */}
                {initialAuditPending && !auditError && !qualityReport && (
                  <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3.5 text-xs flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-blue-900 text-[11px] font-medium">
                        Initial audit deferred due to AI queue.
                      </span>
                    </div>
                    <button
                      onClick={() => runQualityCheck()}
                      disabled={isQualityLoading}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Run Audit
                    </button>
                  </div>
                )}

                {isQualityLoading ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="w-24 h-24 rounded-full bg-slate-200 mx-auto" />
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-16 bg-slate-200 rounded-xl" />
                    ))}
                  </div>
                ) : qualityReport ? (
                  <>
                    {/* Overall Score Gauge */}
                    <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                      <ScoreRing
                        score={qualityReport.overall_score}
                        grade={qualityReport.grade}
                      />
                      <div className="mt-2">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{
                            background: qualityReport.passed ? "#dcfce7" : "#fef3c7",
                            color: qualityReport.passed ? "#166534" : "#92400e",
                          }}
                        >
                          {qualityReport.passed ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {qualityReport.passed ? "Chatbot Verified" : "Action Needed"}
                        </span>
                      </div>
                    </div>

                    {/* Check Criteria Cards */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">
                        Criteria Breakdown
                      </span>
                      {qualityReport.checks.map((check) => (
                        <div
                          key={check.id}
                          className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: statusDot(check.status) }}
                              />
                              <span className="font-medium text-slate-800">
                                {check.name}
                              </span>
                            </div>
                            <span className="font-mono text-slate-400 text-[11px]">
                              {check.score}/{check.max}
                            </span>
                          </div>

                          <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${(check.score / check.max) * 100}%`,
                                background: statusDot(check.status),
                              }}
                            />
                          </div>

                          {check.notes && (
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              {check.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Suggestions */}
                    {qualityReport.suggestions.length > 0 && (
                      <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3 space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase text-blue-800 tracking-wider">
                          Recommendations
                        </span>
                        <ul className="space-y-1">
                          {qualityReport.suggestions.map((sug, i) => (
                            <li
                              key={i}
                              className="text-[11px] text-blue-900/80 flex items-start gap-1.5 leading-relaxed"
                            >
                              <span className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                              <span>{sug}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                    <p>No quality report available.</p>
                    <button
                      onClick={() => runQualityCheck()}
                      disabled={isQualityLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200/60"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Run Quality Audit</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Databricks Upload Modal */}
      <DatabricksManagerModal
        isOpen={showDatabricksModal}
        onClose={() => setShowDatabricksModal(false)}
        markdown={kbMarkdown}
        title={kbTitle}
        qualityPassed={qualityReport?.passed ?? true}
        currentFilename={filename}
        onSuccess={(uploadedName) => {
          setToast({
            message: `Successfully uploaded ${uploadedName} to Databricks Volume!`,
            type: "success",
          });
          setTimeout(() => setToast(null), 5000);
        }}
        onSyncStart={(syncedName) => {
          setToast({
            message: `Assistant is syncing ${syncedName} in background. A notification will appear once it's done.`,
            type: "info",
          });
          setTimeout(() => setToast(null), 6000);
        }}
        onSyncComplete={(syncedName) => {
          setToast({
            message: `${syncedName} is synced with Knowledge Assistant.`,
            type: "success",
          });
          setTimeout(() => setToast(null), 5000);
        }}
      />

      {/* Exit / Save Draft Modal */}
      <ExitModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onSaveDraft={handleSaveDraftAndExit}
        onDiscard={handleDiscardAndExit}
      />

      {/* Toast Notification (Linear/Vercel sleek graphite capsule) */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl shadow-xl bg-slate-900 text-white text-xs font-medium border border-slate-800/80 backdrop-blur-md">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : toast.type === "info" ? (
              <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <span className="text-slate-200">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-1 text-slate-400 hover:text-white transition-colors p-0.5 rounded"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
