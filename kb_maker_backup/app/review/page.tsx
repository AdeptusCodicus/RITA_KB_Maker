"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Upload,
  FileText,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Eye,
  Code,
  Sparkles,
  LogOut,
  Save,
  Trash2,
  Send,
} from "lucide-react";
import type { QualityReport } from "@/types/kb";
import { saveDraft, deleteDraft, getActiveDraftId } from "@/lib/drafts";
import Sidebar from "@/components/Sidebar";
import DatabricksManagerModal from "@/components/DatabricksManagerModal";

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function scoreColor(score: number): string {
  if (score >= 75) return "var(--color-success)";
  if (score >= 50) return "var(--color-warning)";
  return "var(--color-danger)";
}

function statusDot(status: "pass" | "warn" | "fail"): string {
  if (status === "pass") return "var(--color-success)";
  if (status === "warn") return "var(--color-warning)";
  return "var(--color-danger)";
}

/* ── Score Ring Component ────────────────────────────────────────────────────── */

function ScoreRing({
  score,
  grade,
  size = 120,
}: {
  score: number;
  grade: string;
  size?: number;
}) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

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
      <div className="absolute flex flex-col items-center">
        <span
          className="text-3xl font-bold"
          style={{ color: scoreColor(score) }}
        >
          {grade}
        </span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
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
        className="rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          Exit Review Session?
        </h3>
        <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
          Would you like to save your current Knowledge Base as a draft in the sidebar sub-menu or discard it completely?
        </p>

        <div className="space-y-2.5">
          <button
            onClick={onSaveDraft}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "var(--color-accent)" }}
          >
            <Save className="w-4 h-4" />
            Save as Draft & Exit
          </button>

          <button
            onClick={onDiscard}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            style={{ border: "1px solid #fca5a5" }}
          >
            <Trash2 className="w-4 h-4" />
            Discard & Delete
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            Continue Editing
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Review Page ─────────────────────────────────────────────────────────────── */

export default function ReviewPage() {
  const router = useRouter();
  const [extractedText, setExtractedText] = useState("");
  const [kbMarkdown, setKbMarkdown] = useState("");
  const [filename, setFilename] = useState("");
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [isQualityLoading, setIsQualityLoading] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");

  // Refinement state
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  // Load data from sessionStorage
  useEffect(() => {
    const text = sessionStorage.getItem("kb_extracted_text");
    const md = sessionStorage.getItem("kb_markdown");
    const fn = sessionStorage.getItem("kb_filename");
    const qr = sessionStorage.getItem("kb_quality_report");

    if (!text || !md) {
      router.push("/");
      return;
    }

    setExtractedText(text);
    setKbMarkdown(md);
    setFilename(fn || "document");
    if (qr) {
      try {
        setQualityReport(JSON.parse(qr));
      } catch {
        // Invalid quality report
      }
    }
  }, [router]);

  // Extract title from markdown header (# H1)
  const kbTitle = (() => {
    const match = kbMarkdown.match(/^#\s+(.+)$/m);
    if (match?.[1]) return match[1].trim();
    const base = filename.replace(/\.[^.]+$/, "");
    return `KB_${base.charAt(0).toUpperCase() + base.slice(1)}`;
  })();

  // Re-run quality check
  const runQualityCheck = useCallback(async (overrideMd?: string) => {
    setIsQualityLoading(true);
    const mdToCheck = typeof overrideMd === 'string' ? overrideMd : kbMarkdown;
    try {
      const res = await fetch("/api/quality-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: mdToCheck }),
      });
      if (res.ok) {
        const report = await res.json();
        setQualityReport(report);
        sessionStorage.setItem("kb_quality_report", JSON.stringify(report));
      }
    } catch {
      // Quality check error
    } finally {
      setIsQualityLoading(false);
    }
  }, [kbMarkdown]);

  // Refine KB using user prompt instructions
  const handleRefineKB = async () => {
    if (!refinementPrompt.trim() || isRefining) return;

    setIsRefining(true);
    let updatedMd = "";

    try {
      const res = await fetch("/api/refine-kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: kbMarkdown,
          instructions: refinementPrompt,
          originalText: extractedText,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Refinement failed");
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
                  }
                  if (parsed.error) {
                    throw new Error(parsed.error);
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
        sessionStorage.setItem("kb_markdown", updatedMd);
        setRefinementPrompt("");
        setToast("Knowledge Base refined successfully!");
        setTimeout(() => setToast(null), 4000);
        // Automatically re-run quality check on refined KB
        runQualityCheck(updatedMd);
      }
    } catch (error) {
      setToast(
        `Refinement failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsRefining(false);
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

  // Upload to Databricks
  const handleUpload = useCallback(
    async (override: boolean, customFilename: string) => {
      setPushLoading(true);
      try {
        const res = await fetch("/api/databricks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            markdown: kbMarkdown,
            title: kbTitle,
            filename: customFilename,
            override,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Upload failed");
        }
        setShowModal(false);
        setToast("Successfully uploaded to Databricks!");
        setTimeout(() => setToast(null), 5000);
      } catch (error) {
        setToast(
          `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        setTimeout(() => setToast(null), 5000);
      } finally {
        setPushLoading(false);
      }
    },
    [kbMarkdown, kbTitle]
  );

  if (!extractedText && !kbMarkdown) {
    return (
      <div className="flex h-full">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2
            className="w-6 h-6 animate-spin"
            style={{ color: "var(--color-accent)" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content — Three Panel Layout */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{
            background: "var(--color-surface)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              aria-label={leftPanelOpen ? "Collapse source panel" : "Expand source panel"}
            >
              {leftPanelOpen ? (
                <ChevronLeft className="w-4 h-4" style={{ color: "var(--color-text-muted)" }} />
              ) : (
                <ChevronRight className="w-4 h-4" style={{ color: "var(--color-text-muted)" }} />
              )}
            </button>
            <h1
              className="text-sm font-semibold truncate max-w-xs"
              style={{ color: "var(--color-text-primary)" }}
            >
              {kbTitle}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full hidden sm:inline-block"
              style={{
                background: "var(--color-surface-tertiary)",
                color: "var(--color-text-muted)",
              }}
            >
              {filename}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => runQualityCheck()}
              disabled={isQualityLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              {isQualityLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Re-check Quality
            </button>

            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
              style={{ background: "var(--color-accent)" }}
            >
              <Upload className="w-3 h-3" />
              Upload to Databricks
            </button>

            <button
              onClick={() => setShowExitModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-slate-600 hover:bg-slate-100"
              style={{ border: "1px solid var(--color-border)" }}
              title="Exit review"
            >
              <LogOut className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>
        </header>

        {/* Quality warning banner */}
        {qualityReport && !qualityReport.passed && (
          <div
            className="flex items-center gap-2 px-4 py-2 text-sm"
            style={{
              background: "#fef3c7",
              borderBottom: "1px solid #f59e0b",
              color: "#92400e",
            }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              This KB did not pass quality checks (score: {qualityReport.overall_score}/100). Review suggestions before pushing.
            </span>
          </div>
        )}

        {/* Panels */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel — Extracted Text */}
          {leftPanelOpen && (
            <div
              className="w-80 flex-shrink-0 flex flex-col overflow-hidden"
              style={{ borderRight: "1px solid var(--color-border)" }}
            >
              <div
                className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between"
                style={{
                  background: "var(--color-surface-tertiary)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Source Document Text
                </span>
              </div>
              <div
                className="flex-1 overflow-auto p-4 custom-scrollbar"
                style={{ background: "var(--color-surface)" }}
              >
                <pre
                  className="text-xs leading-relaxed whitespace-pre-wrap"
                  style={{
                    color: "var(--color-text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {extractedText}
                </pre>
              </div>
            </div>
          )}

          {/* Center Panel — KB Editor & Refinement Input */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div
              className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between"
              style={{
                background: "var(--color-surface-tertiary)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Knowledge Base Document
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditorMode("edit")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                  style={{
                    background: editorMode === "edit" ? "var(--color-surface)" : "transparent",
                    color: editorMode === "edit" ? "var(--color-text-primary)" : "var(--color-text-muted)",
                    boxShadow: editorMode === "edit" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  <Code className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={() => setEditorMode("preview")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                  style={{
                    background: editorMode === "preview" ? "var(--color-surface)" : "transparent",
                    color: editorMode === "preview" ? "var(--color-text-primary)" : "var(--color-text-muted)",
                    boxShadow: editorMode === "preview" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  <Eye className="w-3 h-3" />
                  Preview
                </button>
              </div>
            </div>

            <div
              className="flex-1 overflow-auto"
              style={{ background: "var(--color-surface)" }}
            >
              {editorMode === "edit" ? (
                <textarea
                  value={kbMarkdown}
                  onChange={(e) => {
                    setKbMarkdown(e.target.value);
                    sessionStorage.setItem("kb_markdown", e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const value = target.value;
                      const newValue =
                        value.substring(0, start) + "  " + value.substring(end);
                      setKbMarkdown(newValue);
                      sessionStorage.setItem("kb_markdown", newValue);
                      requestAnimationFrame(() => {
                        target.selectionStart = target.selectionEnd = start + 2;
                      });
                    }
                  }}
                  className="kb-editor w-full h-full p-4 border-0 custom-scrollbar"
                  style={{
                    background: "var(--color-surface)",
                    color: "var(--color-text-primary)",
                  }}
                  spellCheck={false}
                />
              ) : (
                <div
                  className="p-6 prose prose-sm max-w-none custom-scrollbar h-full overflow-auto"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {kbMarkdown.split("\n").map((line, i) => {
                    if (line.startsWith("### "))
                      return (
                        <h3 key={i} className="text-base font-semibold mt-4 mb-1">
                          {line.slice(4)}
                        </h3>
                      );
                    if (line.startsWith("## "))
                      return (
                        <h2
                          key={i}
                          className="text-lg font-bold mt-6 mb-2"
                          style={{
                            borderBottom: "1px solid var(--color-border)",
                            paddingBottom: "0.25rem",
                          }}
                        >
                          {line.slice(3)}
                        </h2>
                      );
                    if (line.startsWith("# "))
                      return (
                        <h1 key={i} className="text-xl font-bold mt-4 mb-3">
                          {line.slice(2)}
                        </h1>
                      );
                    if (line.startsWith("---"))
                      return (
                        <hr
                          key={i}
                          className="my-4"
                          style={{ borderColor: "var(--color-border)" }}
                        />
                      );
                    if (line.trim() === "") return <br key={i} />;
                    return (
                      <p key={i} className="text-sm my-0.5">
                        {line}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Refine KB Prompt Input Field */}
            <div
              className="p-3 border-t flex items-center gap-2"
              style={{
                background: "var(--color-surface-tertiary)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="flex items-center gap-1.5 text-blue-600 pl-1">
                <Sparkles className="w-4 h-4 flex-shrink-0 animate-pulse" />
              </div>
              <input
                type="text"
                value={refinementPrompt}
                onChange={(e) => setRefinementPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRefineKB();
                }}
                placeholder="Ask AI to refine this KB (e.g., 'Add step to notify HR', 'Shorten FAQ answers')..."
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isRefining}
              />
              <button
                onClick={handleRefineKB}
                disabled={!refinementPrompt.trim() || isRefining}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-40"
                style={{ background: "var(--color-accent)" }}
              >
                {isRefining ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Refine
              </button>
            </div>
          </div>

          {/* Right Panel — Quality Scorecard */}
          <div
            className="w-80 lg:w-96 flex-shrink-0 flex flex-col overflow-hidden"
            style={{ borderLeft: "1px solid var(--color-border)" }}
          >
            <div
              className="px-4 py-2.5 flex-shrink-0"
              style={{
                background: "var(--color-surface-tertiary)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Quality Scorecard
              </span>
            </div>
            <div
              className="flex-1 overflow-auto p-4 custom-scrollbar"
              style={{ background: "var(--color-surface-secondary)" }}
            >
              {isQualityLoading ? (
                <div className="space-y-4">
                  <div className="flex justify-center py-6">
                    <div className="w-28 h-28 rounded-full skeleton" />
                  </div>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton h-16 rounded-lg" />
                  ))}
                </div>
              ) : qualityReport ? (
                <div className="space-y-5">
                  {/* Score Ring */}
                  <div className="flex justify-center py-2">
                    <ScoreRing
                      score={qualityReport.overall_score}
                      grade={qualityReport.grade}
                    />
                  </div>

                  {/* Pass/Fail Badge */}
                  <div className="flex justify-center">
                    <span
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
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
                      {qualityReport.passed ? "Passed" : "Needs Improvement"}
                    </span>
                  </div>

                  {/* Individual Checks */}
                  <div className="space-y-2.5">
                    {qualityReport.checks.map((check) => (
                      <div
                        key={check.id}
                        className="rounded-lg p-3"
                        style={{
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                background: statusDot(check.status),
                              }}
                            />
                            <span
                              className="text-xs font-medium"
                              style={{
                                color: "var(--color-text-primary)",
                              }}
                            >
                              {check.name}
                            </span>
                          </div>
                          <span
                            className="text-xs font-mono"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {check.score}/{check.max}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div
                          className="h-1.5 rounded-full overflow-hidden"
                          style={{
                            background: "var(--color-surface-tertiary)",
                          }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(check.score / check.max) * 100}%`,
                              background: statusDot(check.status),
                            }}
                          />
                        </div>
                        {check.notes && (
                          <p
                            className="text-xs mt-1.5 leading-relaxed"
                            style={{
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {check.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Suggestions */}
                  {qualityReport.suggestions.length > 0 && (
                    <div>
                      <h4
                        className="text-xs font-semibold uppercase tracking-wider mb-2"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Suggestions
                      </h4>
                      <ul className="space-y-1.5">
                        {qualityReport.suggestions.map((s, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-xs"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            <span
                              className="mt-1 w-1 h-1 rounded-full flex-shrink-0"
                              style={{
                                background: "var(--color-accent)",
                              }}
                            />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Auto-fixed */}
                  {qualityReport.auto_fixed_issues.length > 0 && (
                    <div>
                      <h4
                        className="text-xs font-semibold uppercase tracking-wider mb-2"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Auto-fixed Issues
                      </h4>
                      <ul className="space-y-1.5">
                        {qualityReport.auto_fixed_issues.map((s, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-xs"
                            style={{ color: "var(--color-success)" }}
                          >
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    No quality report available.
                  </p>
                  <button
                    onClick={() => runQualityCheck()}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      color: "var(--color-accent)",
                      border: "1px solid var(--color-accent)",
                    }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Run Quality Check
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Databricks Manager Modal */}
      <DatabricksManagerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onUpload={handleUpload}
        title={kbTitle}
        qualityPassed={qualityReport?.passed ?? true}
        isLoading={pushLoading}
        currentFilename={filename}
      />

      {/* Exit Modal */}
      <ExitModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onSaveDraft={handleSaveDraftAndExit}
        onDiscard={handleDiscardAndExit}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 toast-enter">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm"
            style={{
              background: toast.includes("failed") ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${toast.includes("failed") ? "#fecaca" : "#bbf7d0"}`,
              color: toast.includes("failed") ? "#991b1b" : "#166534",
            }}
          >
            {toast.includes("failed") ? (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
