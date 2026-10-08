'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Search,
  Plus,
  RefreshCw,
  ExternalLink,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Database,
  Calendar,
  User,
  X,
  Code,
  Tag,
  Clock,
  Sparkles,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import type { TeamKBRecord } from '@/types/auth';

export default function TeamKBsPage() {
  const router = useRouter();
  const { session, role, isSuperadmin } = useAuth();
  const [kbs, setKbs] = useState<TeamKBRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKB, setSelectedKB] = useState<TeamKBRecord | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = isSuperadmin || role === 'admin' || role === 'editor';

  const fetchKBs = useCallback(async () => {
    if (!session?.teamId && !isSuperadmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const targetTeam = session?.teamId || 'global';
      const res = await fetch(`/api/teams/${targetTeam}/kbs?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setKbs(data.kbs || []);
      }
    } catch (e) {
      console.error('Failed to load team KBs:', e);
    } finally {
      setLoading(false);
    }
  }, [session?.teamId, isSuperadmin]);

  useEffect(() => {
    fetchKBs();
  }, [fetchKBs]);

  const handleOpenPreview = async (kb: TeamKBRecord) => {
    setSelectedKB(kb);
    setPreviewLoading(true);
    setPreviewContent(null);
    try {
      if (kb.databricksPath) {
        const res = await fetch(`/api/databricks/file?path=${encodeURIComponent(kb.databricksPath)}`);
        if (res.ok) {
          const data = await res.json();
          setPreviewContent(data.content);
        } else {
          setPreviewContent('# Error\nFailed to load content from Databricks volume.');
        }
      } else {
        setPreviewContent('# Knowledge Base\nNo Databricks volume path linked.');
      }
    } catch {
      setPreviewContent('# Error\nFailed to retrieve file content.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeleteKB = async (kb: TeamKBRecord) => {
    if (!confirm(`Are you sure you want to remove "${kb.title}" from this team?`)) return;
    setDeletingId(kb.id);
    try {
      const targetTeam = session?.teamId || 'global';
      const res = await fetch(`/api/teams/${targetTeam}/kbs?kbId=${encodeURIComponent(kb.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setKbs((prev) => prev.filter((k) => k.id !== kb.id));
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete knowledge base');
      }
    } catch {
      alert('Network error while deleting');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredKBs = kbs.filter((k) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      k.title.toLowerCase().includes(q) ||
      k.filename.toLowerCase().includes(q) ||
      k.uploadedBy?.name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-screen w-full bg-[#070a11] text-slate-100 antialiased overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0e1a]">
        {/* Top Header */}
        <header className="px-6 py-4 border-b border-[#1a2234] bg-[#090d16] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white tracking-tight">Team Knowledge Base</h1>
                <span className="px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-500/30 text-[11px] font-medium text-blue-300">
                  {session?.teamName || 'Your Team'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Official knowledge documents created and maintained by your team.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchKBs}
              disabled={loading}
              className="p-2 rounded-xl bg-[#131b2e] hover:bg-[#19243b] border border-[#22314d] text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Refresh list"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {canEdit && (
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>New Knowledge Base</span>
              </button>
            )}
          </div>
        </header>

        {/* Filter and Stats Bar */}
        <div className="px-6 py-3 border-b border-[#1a2234]/80 bg-[#080c16] flex items-center justify-between gap-4 flex-shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by title, filename, or author..."
              className="w-full bg-[#0d1424] border border-[#1a2234] rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Total KBs:</span>
            <span className="font-mono font-medium text-slate-200 bg-[#131b2e] px-2 py-0.5 rounded-md border border-[#22314d]">
              {kbs.length}
            </span>
          </div>
        </div>

        {/* Content Table / List */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              <p className="text-xs">Loading team knowledge bases...</p>
            </div>
          ) : filteredKBs.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-[#1a2234] rounded-2xl bg-[#0d1424]/40">
              <FileText className="w-10 h-10 stroke-1 text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-400">No knowledge bases found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">
                {searchQuery
                  ? `No documents matching "${searchQuery}"`
                  : 'Your team has not uploaded any knowledge bases yet. Ingest documents from the home screen to add.'}
              </p>
              {canEdit && !searchQuery && (
                <button
                  onClick={() => router.push('/')}
                  className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create First KB
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredKBs.map((kb) => (
                <div
                  key={kb.id}
                  className="bg-[#0e1424] border border-[#1a2234] hover:border-blue-500/40 rounded-xl p-4 flex flex-col justify-between transition-all group hover:shadow-lg hover:shadow-blue-950/20"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      {kb.qualityScore !== undefined && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold border ${
                            kb.qualityScore >= 80
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          Score: {kb.qualityScore}% {kb.qualityGrade ? `(${kb.qualityGrade})` : ''}
                        </span>
                      )}
                    </div>

                    <h3 className="text-xs font-semibold text-white tracking-tight line-clamp-1 mb-1" title={kb.title}>
                      {kb.title}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400 truncate mb-3" title={kb.filename}>
                      {kb.filename}
                    </p>

                    <div className="space-y-1 text-[11px] text-slate-500 border-t border-[#1a2234]/60 pt-2 mb-3">
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="w-3 h-3 text-slate-500 flex-shrink-0" />
                        <span>By {kb.uploadedBy?.name || kb.uploadedBy?.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Database className="w-3 h-3 text-slate-500 flex-shrink-0" />
                        <span className="truncate">{kb.databricksPath || 'Databricks Volume'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#1a2234] mt-2">
                    <button
                      onClick={() => handleOpenPreview(kb)}
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteKB(kb)}
                          disabled={deletingId === kb.id}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Delete from team"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Markdown Preview Modal */}
        {selectedKB && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0c1220] border border-[#1a2234] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1a2234] flex items-center justify-between bg-[#080c16]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-white truncate">{selectedKB.title}</h3>
                    <p className="text-[10px] font-mono text-slate-400 truncate">{selectedKB.filename}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedKB(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-[#090d16] font-mono text-xs leading-relaxed text-slate-300 custom-scrollbar whitespace-pre-wrap">
                {previewLoading ? (
                  <div className="h-48 flex items-center justify-center text-slate-500 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                    <span>Loading document from Databricks...</span>
                  </div>
                ) : (
                  previewContent
                )}
              </div>

              <div className="px-5 py-3 border-t border-[#1a2234] bg-[#080c16] flex justify-end">
                <button
                  onClick={() => setSelectedKB(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
