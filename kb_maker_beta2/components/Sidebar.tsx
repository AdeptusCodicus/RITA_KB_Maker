'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  AlertCircle,
  BookOpen,
  Users,
  History,
  Building2,
  LogOut,
  Shield,
  ShieldCheck,
  Edit3,
  Eye,
} from 'lucide-react';
import { getAllDrafts, deleteDraft, getActiveDraftId, setActiveDraftId } from '@/lib/drafts';
import { useAuth } from '@/components/AuthProvider';
import AccountModal from './AccountModal';
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
  const { session, role, isSuperadmin, switchDevEmail } = useAuth();
  const [drafts, setDrafts] = useState<KBDraft[]>([]);
  const [activeDraftId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [shortcutLabel, setShortcutLabel] = useState('⌘N');
  const [kbFileCount, setKbFileCount] = useState<number | null>(null);
  const [kbSyncState, setKbSyncState] = useState<string>('UNKNOWN');
  const [kbVolumePath, setKbVolumePath] = useState<string>('');
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const syncPollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const canCreate = isSuperadmin || role === 'admin' || role === 'editor';
  const canViewLogs = isSuperadmin || role === 'admin';

  // OS detection for keyboard shortcut display (⌘N for macOS, Ctrl+N for Windows/Linux)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const ua = navigator.userAgent || '';
    if (/Windows|Win32|Win64|Linux|X11|Android/i.test(ua)) {
      setShortcutLabel('Ctrl+N');
      return;
    }
    if (/Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua)) {
      setShortcutLabel('⌘N');
      return;
    }
    setShortcutLabel('Ctrl+N');
  }, []);

  const refreshDrafts = useCallback(() => {
    setDrafts(getAllDrafts());
    setActiveId(getActiveDraftId());
  }, []);

  const startSyncPolling = useCallback(() => {
    if (syncPollTimerRef.current) clearInterval(syncPollTimerRef.current);

    let attempts = 0;
    const maxAttempts = 180;

    syncPollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const syncRes = await fetch(`/api/databricks/sync?_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          if (syncData.state) {
            setKbSyncState(syncData.state);
            if (syncData.state === 'UPDATED') {
              if (syncPollTimerRef.current) clearInterval(syncPollTimerRef.current);
              syncPollTimerRef.current = null;
              fetch(`/api/databricks?_t=${Date.now()}`, { cache: 'no-store' })
                .then((r) => r.json())
                .then((d) => {
                  if (Array.isArray(d.files)) setKbFileCount(d.files.length);
                })
                .catch(() => {});
              return;
            }
          }
        }
      } catch {
        // non-blocking
      }

      if (attempts >= maxAttempts) {
        if (syncPollTimerRef.current) clearInterval(syncPollTimerRef.current);
        syncPollTimerRef.current = null;
      }
    }, 5000);
  }, []);

  const refreshDatabricksStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/databricks?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.files)) {
          setKbFileCount(data.files.length);
        }
        if (data.kbPath) {
          setKbVolumePath(data.kbPath);
        }
      }
      const syncRes = await fetch(`/api/databricks/sync?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        if (syncData.state) {
          setKbSyncState(syncData.state);
          if (syncData.state === 'UPDATING') {
            startSyncPolling();
          } else if (syncPollTimerRef.current) {
            clearInterval(syncPollTimerRef.current);
            syncPollTimerRef.current = null;
          }
        }
      }
    } catch {
      // non-blocking
    }
  }, [startSyncPolling]);

  useEffect(() => {
    refreshDrafts();
    refreshDatabricksStatus();

    const handleAssistantSynced = () => {
      setKbSyncState('UPDATED');
      if (syncPollTimerRef.current) {
        clearInterval(syncPollTimerRef.current);
        syncPollTimerRef.current = null;
      }
      refreshDatabricksStatus();
    };

    window.addEventListener('kb_drafts_updated', refreshDrafts);
    window.addEventListener('storage', refreshDrafts);
    window.addEventListener('kb_databricks_updated', refreshDatabricksStatus);
    window.addEventListener('kb_assistant_synced', handleAssistantSynced);

    return () => {
      window.removeEventListener('kb_drafts_updated', refreshDrafts);
      window.removeEventListener('storage', refreshDrafts);
      window.removeEventListener('kb_databricks_updated', refreshDatabricksStatus);
      window.removeEventListener('kb_assistant_synced', handleAssistantSynced);
      if (syncPollTimerRef.current) {
        clearInterval(syncPollTimerRef.current);
        syncPollTimerRef.current = null;
      }
    };
  }, [refreshDrafts, refreshDatabricksStatus]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && canCreate) {
        e.preventDefault();
        handleNewKB();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/kb');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, canCreate]);

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
  const isAllKBActive = pathname === '/kb';
  const isTeamKBsActive = pathname === '/team/kbs';
  const isTeamMembersActive = pathname === '/team/members';
  const isLogsActive = pathname === '/team/logs';
  const isOrgActive = pathname === '/admin/org';

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
          Beta 3
        </span>
      </div>

      {/* Primary Actions */}
      <div className="px-3 pt-3 pb-2 space-y-1">
        {canCreate && (
          <button
            onClick={handleNewKB}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all border shadow-xs group ${
              isNewKBActive
                ? 'bg-blue-950/60 text-white border-blue-500/50 ring-1 ring-blue-500/30'
                : 'bg-[#131b2e] hover:bg-[#19243b] text-slate-200 hover:text-white border-[#22314d] hover:border-blue-500/40'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-all flex-shrink-0 ${
                  isNewKBActive
                    ? 'bg-blue-600 text-white border border-blue-400/50'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:bg-blue-600 group-hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <span className="font-semibold tracking-tight">New Knowledge Base</span>
            </div>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-slate-400 bg-[#090d16] border-[#22314d]">
              {shortcutLabel}
            </kbd>
          </button>
        )}

        {/* All Knowledge Bases (Shared Volume) */}
        <button
          onClick={() => router.push('/kb')}
          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-all border group ${
            isAllKBActive
              ? 'bg-blue-950/50 text-blue-200 border-blue-500/50 ring-1 ring-blue-500/30'
              : 'bg-[#101728]/80 hover:bg-[#152038] text-slate-300 hover:text-white border-[#1c273e]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-5 h-5 rounded-md flex items-center justify-center bg-slate-800 text-slate-400 border border-slate-700/60 flex-shrink-0">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <span className="tracking-tight truncate font-medium">All Knowledge Bases</span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {kbFileCount !== null && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                {kbFileCount}
              </span>
            )}
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                kbSyncState === 'UPDATING'
                  ? 'bg-blue-400 animate-pulse'
                  : kbSyncState === 'UPDATED'
                  ? 'bg-emerald-400'
                  : 'bg-slate-500'
              }`}
            />
          </div>
        </button>

        {/* Team Knowledge Base (Team Content Panel) */}
        <button
          onClick={() => router.push('/team/kbs')}
          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-all border group ${
            isTeamKBsActive
              ? 'bg-blue-950/50 text-blue-200 border-blue-500/50 ring-1 ring-blue-500/30'
              : 'bg-[#101728]/80 hover:bg-[#152038] text-slate-300 hover:text-white border-[#1c273e]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-5 h-5 rounded-md flex items-center justify-center bg-slate-800 text-slate-400 border border-slate-700/60 flex-shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <span className="tracking-tight truncate font-medium">Team Knowledge Base</span>
          </div>
        </button>

        {/* Team Members */}
        <button
          onClick={() => router.push('/team/members')}
          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-all border group ${
            isTeamMembersActive
              ? 'bg-blue-950/50 text-blue-200 border-blue-500/50 ring-1 ring-blue-500/30'
              : 'bg-[#101728]/80 hover:bg-[#152038] text-slate-300 hover:text-white border-[#1c273e]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-5 h-5 rounded-md flex items-center justify-center bg-slate-800 text-slate-400 border border-slate-700/60 flex-shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
            <span className="tracking-tight truncate font-medium">Team Members</span>
          </div>
        </button>

        {/* Audit Logs (Admins & Superadmins only) */}
        {canViewLogs && (
          <button
            onClick={() => router.push('/team/logs')}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-all border group ${
              isLogsActive
                ? 'bg-blue-950/50 text-blue-200 border-blue-500/50 ring-1 ring-blue-500/30'
                : 'bg-[#101728]/80 hover:bg-[#152038] text-slate-300 hover:text-white border-[#1c273e]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-5 h-5 rounded-md flex items-center justify-center bg-slate-800 text-slate-400 border border-slate-700/60 flex-shrink-0">
                <History className="w-3.5 h-3.5" />
              </div>
              <span className="tracking-tight truncate font-medium">Audit Logs</span>
            </div>
          </button>
        )}

        {/* Organization Management (Superadmins only) */}
        {isSuperadmin && (
          <button
            onClick={() => router.push('/admin/org')}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-all border group ${
              isOrgActive
                ? 'bg-purple-950/50 text-purple-200 border-purple-500/50 ring-1 ring-purple-500/30'
                : 'bg-[#101728]/80 hover:bg-[#152038] text-slate-300 hover:text-white border-[#1c273e]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-5 h-5 rounded-md flex items-center justify-center bg-purple-950/60 text-purple-400 border border-purple-700/60 flex-shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <span className="tracking-tight truncate font-medium text-purple-300">Organization</span>
            </div>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-500/20 text-purple-300">
              Super
            </span>
          </button>
        )}
      </div>

      {/* Drafts Section */}
      <div className="flex-1 flex flex-col min-h-0 px-3 py-2 border-t border-[#1a2234]/60">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
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
            <div className="px-3 py-6 text-center flex flex-col items-center justify-center text-slate-600">
              <FileText className="w-7 h-7 stroke-1 text-slate-700 mb-1.5" />
              <p className="text-xs font-medium text-slate-500">No saved drafts</p>
              <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">
                Ingested documents will appear here.
              </p>
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
                  className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-blue-950/40 text-blue-300 border-blue-500/40 shadow-sm ring-1 ring-blue-500/20'
                      : 'border-transparent text-slate-400 hover:bg-[#131b2e] hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-start space-x-2 min-w-0 flex-1 pr-2">
                    <FileText className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-xs text-slate-200 group-hover:text-white leading-tight" title={draft.title || draft.filename}>
                        {draft.title || draft.filename || 'Untitled Knowledge Base'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
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

      {/* User Identity Profile Footer */}
      <div className="p-3 border-t border-[#1a2234] bg-[#070a11]">
        <div
          onClick={() => setIsAccountModalOpen(true)}
          className="flex items-center justify-between p-2 rounded-xl bg-[#0e1422] hover:bg-[#131b2e] border border-[#1a2234] hover:border-blue-500/30 transition-all cursor-pointer group"
          title="Manage account & workspace permissions"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-slate-800 group-hover:bg-blue-600/20 border border-slate-700 group-hover:border-blue-500/40 flex items-center justify-center text-xs font-semibold text-slate-200 group-hover:text-blue-300 flex-shrink-0 transition-colors">
              {session?.name ? session.name.charAt(0).toUpperCase() : session?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 group-hover:text-white truncate leading-tight transition-colors">
                {session?.name || session?.email?.split('@')[0] || 'User'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded font-mono border ${
                    session?.isSimulating
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : isSuperadmin
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                      : role === 'admin'
                      ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                      : role === 'editor'
                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                      : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                  }`}
                >
                  {session?.isSimulating ? `SIM: ${role}` : isSuperadmin ? 'Superadmin' : role}
                </span>
                <span className="text-[10px] text-slate-500 truncate max-w-[80px]">
                  {session?.teamName || 'Org'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsAccountModalOpen(true);
            }}
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
            title="Account & Session Settings"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />
    </aside>
  );
}
