'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Shield,
  FilePlus,
  FileEdit,
  Trash2,
  UserPlus,
  UserMinus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import type { AuditLogRecord, AuditActionType } from '@/types/auth';

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
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getActionBadge(action: AuditActionType) {
  switch (action) {
    case 'KB_CREATED':
      return {
        label: 'KB Created',
        icon: FilePlus,
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      };
    case 'KB_EDITED':
      return {
        label: 'KB Updated',
        icon: FileEdit,
        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      };
    case 'KB_DELETED':
      return {
        label: 'KB Deleted',
        icon: Trash2,
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      };
    case 'KB_PUSHED':
      return {
        label: 'Databricks Sync',
        icon: Database,
        color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      };
    case 'MEMBER_ADDED':
      return {
        label: 'Member Added',
        icon: UserPlus,
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      };
    case 'MEMBER_REMOVED':
      return {
        label: 'Member Removed',
        icon: UserMinus,
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      };
    case 'ROLE_CHANGED':
      return {
        label: 'Role Changed',
        icon: Shield,
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      };
    default:
      return {
        label: action.replace(/_/g, ' '),
        icon: History,
        color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      };
  }
}

export default function TeamLogsPage() {
  const { session, role, isSuperadmin } = useAuth();
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isAllowed = isSuperadmin || role === 'admin';

  const fetchLogs = useCallback(async () => {
    if (!session?.teamId && !isSuperadmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const targetTeam = session?.teamId || 'global';
      const res = await fetch(`/api/teams/${targetTeam}/logs?limit=100&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
    }
  }, [session?.teamId, isSuperadmin]);

  useEffect(() => {
    if (isAllowed) {
      fetchLogs();
    }
  }, [isAllowed, fetchLogs]);

  // Guard view if Editor or Viewer accesses directly
  if (!isAllowed) {
    return (
      <div className="flex h-screen w-full bg-[#070a11] text-slate-100 antialiased overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0a0e1a]">
          <div className="max-w-md w-full bg-[#0d1424] border border-[#1a2234] rounded-2xl p-8 text-center shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-white mb-2">Access Restricted</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Audit logs are strictly confidential and only visible to Team Administrators and Organization Superadmins.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const filteredLogs = logs.filter((log) => {
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.targetId.toLowerCase().includes(q) ||
      log.performedBy.name?.toLowerCase().includes(q) ||
      log.performedBy.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-screen w-full bg-[#070a11] text-slate-100 antialiased overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0e1a]">
        {/* Header */}
        <header className="px-6 py-4 border-b border-[#1a2234] bg-[#090d16] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white tracking-tight">Team Audit Logs</h1>
                <span className="px-2 py-0.5 rounded-full bg-purple-900/30 border border-purple-500/30 text-[11px] font-medium text-purple-300">
                  {session?.teamName || 'Your Team'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Detailed timeline of knowledge base creations, updates, deletions, and member activities.
              </p>
            </div>
          </div>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded-xl bg-[#131b2e] hover:bg-[#19243b] border border-[#22314d] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </header>

        {/* Filter Bar */}
        <div className="px-6 py-3 border-b border-[#1a2234]/80 bg-[#080c16] flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by user or document filename..."
                className="w-full bg-[#0d1424] border border-[#1a2234] rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-[#0d1424] border border-[#1a2234] rounded-xl px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/60"
              >
                <option value="all">All Actions</option>
                <option value="KB_CREATED">KB Created</option>
                <option value="KB_EDITED">KB Updated</option>
                <option value="KB_DELETED">KB Deleted</option>
                <option value="KB_PUSHED">Databricks Sync</option>
                <option value="MEMBER_ADDED">Member Added</option>
                <option value="ROLE_CHANGED">Role Changed</option>
                <option value="MEMBER_REMOVED">Member Removed</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            <span>Recorded Events: </span>
            <span className="font-mono font-medium text-slate-200 bg-[#131b2e] px-2 py-0.5 rounded-md border border-[#22314d]">
              {logs.length}
            </span>
          </div>
        </div>

        {/* Logs Feed */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              <p className="text-xs">Loading audit logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-[#1a2234] rounded-2xl bg-[#0d1424]/40">
              <History className="w-10 h-10 stroke-1 text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-400">No logs found</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery || actionFilter !== 'all'
                  ? 'No activity matches your filters.'
                  : 'New activities will appear here as team members ingest, edit, and manage documents.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-w-4xl mx-auto">
              {filteredLogs.map((log) => {
                const badge = getActionBadge(log.action);
                const BadgeIcon = badge.icon;

                return (
                  <div
                    key={log.id}
                    className="bg-[#0e1424] border border-[#1a2234] hover:border-slate-700/80 rounded-xl p-3.5 flex items-start justify-between gap-4 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 mt-0.5 ${badge.color}`}>
                        <BadgeIcon className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {formatRelativeTime(log.timestamp)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-200">
                          <span className="font-semibold text-white">
                            {log.performedBy.name || log.performedBy.email.split('@')[0]}
                          </span>{' '}
                          <span className="text-slate-400">({log.performedBy.email})</span>{' '}
                          <span className="text-slate-400">performed</span>{' '}
                          <span className="font-mono text-blue-300 font-medium">{log.action}</span>{' '}
                          <span className="text-slate-400">on</span>{' '}
                          <span className="font-semibold text-white font-mono">{log.targetId}</span>
                        </p>

                        {/* Additional details */}
                        {log.details && (
                          <div className="mt-1.5 text-[11px] font-mono text-slate-400 flex flex-wrap gap-2">
                            {log.details.title && (
                              <span className="bg-[#131b2e] px-1.5 py-0.5 rounded border border-[#1a2234]">
                                Title: {log.details.title}
                              </span>
                            )}
                            {log.details.qualityScore !== undefined && (
                              <span className="bg-[#131b2e] px-1.5 py-0.5 rounded border border-[#1a2234] text-emerald-400">
                                Score: {log.details.qualityScore}%
                              </span>
                            )}
                            {log.details.previousRole && log.details.newRole && (
                              <span className="bg-[#131b2e] px-1.5 py-0.5 rounded border border-[#1a2234] flex items-center gap-1">
                                <span>{log.details.previousRole}</span>
                                <ArrowRight className="w-2.5 h-2.5" />
                                <span className="text-amber-400">{log.details.newRole}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-[10px] font-mono text-slate-500 flex-shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
