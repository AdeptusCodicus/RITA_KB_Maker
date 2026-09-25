'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sparkles,
  Plus,
  FileText,
  Trash2,
  Database,
  Layers,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { getAllDrafts, deleteDraft, getActiveDraftId, setActiveDraftId } from '@/lib/drafts';
import type { KBDraft } from '@/types/kb';

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [drafts, setDrafts] = useState<KBDraft[]>([]);
  const [activeDraftId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [shortcutLabel, setShortcutLabel] = useState('⌘N');

  // OS detection for keyboard shortcut display (⌘N for macOS, Ctrl+N for Windows/Linux)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const ua = navigator.userAgent || '';
    // Prioritize userAgent check (properly responds to DevTools UA switching and real Windows/Linux)
    if (/Windows|Win32|Win64|Linux|X11|Android/i.test(ua)) {
      setShortcutLabel('Ctrl+N');
      return;
    }

    if (/Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua)) {
      setShortcutLabel('⌘N');
      return;
    }

    // Fallback to platform if userAgent didn't match
    const platform = (navigator as any).platform || '';
    if (/Win|Linux/i.test(platform)) {
      setShortcutLabel('Ctrl+N');
      return;
    }
    if (/Mac/i.test(platform)) {
      setShortcutLabel('⌘N');
      return;
    }

    setShortcutLabel('Ctrl+N');
  }, []);

  const refreshDrafts = useCallback(() => {
    setDrafts(getAllDrafts());
    setActiveId(getActiveDraftId());
  }, []);

  useEffect(() => {
    refreshDrafts();
    window.addEventListener('kb_drafts_updated', refreshDrafts);
    window.addEventListener('storage', refreshDrafts);
    return () => {
      window.removeEventListener('kb_drafts_updated', refreshDrafts);
      window.removeEventListener('storage', refreshDrafts);
    };
  }, [refreshDrafts]);

  // Global keyboard shortcut for New KB (Cmd+N on Mac, Ctrl+N on Windows/Linux)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewKB();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNewKB = () => {
    setActiveDraftId(null);
    sessionStorage.removeItem('kb_extracted_text');
    sessionStorage.removeItem('kb_markdown');
    sessionStorage.removeItem('kb_filename');
    sessionStorage.removeItem('kb_quality_report');
    sessionStorage.removeItem('kb_active_draft_id');
    router.push('/');
  };

  const handleSelectDraft = (draft: KBDraft) => {
    setActiveDraftId(draft.id);
    sessionStorage.setItem('kb_extracted_text', draft.extractedText);
    sessionStorage.setItem('kb_markdown', draft.markdown);
    sessionStorage.setItem('kb_filename', draft.filename);
    if (draft.qualityReport) {
      sessionStorage.setItem('kb_quality_report', JSON.stringify(draft.qualityReport));
    } else {
      sessionStorage.removeItem('kb_quality_report');
    }
    router.push('/review');
  };

  const handleDeleteDraft = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteDraft(id);
    if (activeDraftId === id) {
      handleNewKB();
    }
  };

  const filteredDrafts = drafts.filter((draft) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      draft.title?.toLowerCase().includes(q) ||
      draft.filename?.toLowerCase().includes(q)
    );
  });

  const isNewKBActive = pathname === '/';

  return (
    <aside className="h-screen w-64 bg-[#090d16] text-slate-400 flex flex-col border-r border-[#1a2234] flex-shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#1a2234]/80 flex items-center justify-between">
        <div
          onClick={handleNewKB}
          className="flex items-center space-x-2.5 cursor-pointer hover:opacity-90 transition-opacity"
          title="Return to Home"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight leading-none">KB Maker</h1>
            <span className="text-[11px] text-slate-500 font-mono">RITA Assistant</span>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
          Beta 2
        </span>
      </div>

      {/* Primary Action: New Knowledge Base (Highlighted when active) */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={handleNewKB}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border shadow-xs group ${
            isNewKBActive
              ? 'bg-blue-950/60 text-white border-blue-500/50 ring-1 ring-blue-500/30 shadow-blue-950/40'
              : 'bg-[#131b2e] hover:bg-[#19243b] active:bg-[#0f1624] text-slate-200 hover:text-white border-[#22314d] hover:border-blue-500/40'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center transition-all flex-shrink-0 ${
                isNewKBActive
                  ? 'bg-blue-600 text-white border border-blue-400/50 shadow-xs'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600'
              }`}
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span
              className={`font-semibold tracking-tight ${
                isNewKBActive ? 'text-white' : 'text-slate-100 group-hover:text-white'
              }`}
            >
              New Knowledge Base
            </span>
          </div>
          <kbd
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
              isNewKBActive
                ? 'text-blue-300 bg-blue-900/40 border-blue-500/40'
                : 'text-slate-400 group-hover:text-slate-200 bg-[#090d16] border-[#22314d]'
            }`}
          >
            {shortcutLabel}
          </kbd>
        </button>
      </div>

      {/* Drafts Section */}
      <div className="flex-1 flex flex-col min-h-0 px-3 py-2 border-t border-[#1a2234]/60">
        <div className="flex items-center justify-between px-2 py-1.5 mb-1.5">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-slate-500" />
            Saved Drafts
          </span>
          {drafts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono font-medium">
              {drafts.length}
            </span>
          )}
        </div>

        {/* Optional Search Filter if 4 or more drafts */}
        {drafts.length >= 4 && (
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter drafts..."
              className="w-full bg-[#0d1424] border border-[#1a2234] rounded-lg pl-8 pr-2.5 py-1 text-[11px] text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
        )}

        {/* Drafts List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {drafts.length === 0 ? (
            <div className="px-3 py-8 text-center flex flex-col items-center justify-center text-slate-600">
              <FileText className="w-8 h-8 stroke-1 text-slate-700 mb-2" />
              <p className="text-xs font-medium text-slate-500">No saved drafts yet</p>
              <p className="text-[10px] text-slate-600 mt-1 max-w-[160px] leading-relaxed">
                Documents you ingest or refine will be auto-saved here.
              </p>
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              No drafts matching "{searchQuery}"
            </div>
          ) : (
            filteredDrafts.map((draft) => {
              const isSelected = pathname === '/review' && activeDraftId === draft.id;
              const hasScore = Boolean(draft.qualityReport?.overall_score);
              const isPassed = draft.qualityReport?.passed;

              return (
                <div
                  key={draft.id}
                  onClick={() => handleSelectDraft(draft)}
                  className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-blue-950/40 text-blue-300 border-blue-500/40 shadow-sm ring-1 ring-blue-500/20'
                      : 'border-transparent text-slate-400 hover:bg-[#131b2e] hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-start space-x-2 min-w-0 pr-2">
                    <FileText className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-xs text-slate-200 group-hover:text-white leading-tight">
                        {draft.title || draft.filename || 'Untitled Knowledge Base'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-slate-500">
                          {formatRelativeTime(draft.updatedAt)}
                        </span>
                        {hasScore && (
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-mono font-medium inline-flex items-center gap-0.5 ${
                              isPassed
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {isPassed ? (
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            ) : (
                              <AlertCircle className="w-2.5 h-2.5" />
                            )}
                            {draft.qualityReport?.overall_score}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteDraft(e, draft.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all flex-shrink-0"
                    title="Delete Draft"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Target Destination & Status Footer */}
      <div className="p-3 border-t border-[#1a2234] bg-[#070a11]">
        <div className="flex items-center space-x-2.5 px-2.5 py-2 rounded-xl bg-[#0e1422] border border-[#1a2234]">
          <Database className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-300">Databricks Volume</span>
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-[9px] text-slate-500 truncate font-mono mt-0.5">
              /Volumes/kb-prod/rita
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
