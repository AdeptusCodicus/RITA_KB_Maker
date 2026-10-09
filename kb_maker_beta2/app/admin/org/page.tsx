'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Plus,
  Shield,
  ShieldCheck,
  Users,
  FileText,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  X,
  Mail,
  Layers,
  ArrowRight,
  Trash2,
  RotateCcw,
  Clock,
  Archive,
  Info,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import VerifiedEmailInput from '@/components/VerifiedEmailInput';
import type { TeamDocument } from '@/types/auth';

interface EnrichedTeam extends TeamDocument {
  memberCount?: number;
  kbCount?: number;
}

export default function SuperadminOrgPage() {
  const router = useRouter();
  const { session, isSuperadmin } = useAuth();
  const [teams, setTeams] = useState<EnrichedTeam[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'limbo'>('active');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Team Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [isAdminEmailValid, setIsAdminEmailValid] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Archive / Limbo Modal State
  const [teamToArchive, setTeamToArchive] = useState<EnrichedTeam | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Action states
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    if (!isSuperadmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/teams?status=all&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setLoadError(data.error || 'Failed to load organization teams');
      }
    } catch (e: any) {
      console.error('Failed to load organization teams:', e);
      setLoadError(e?.message || 'Network error loading teams');
    } finally {
      setLoading(false);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Guard view if not superadmin
  if (!isSuperadmin) {
    return (
      <div className="flex h-full w-full bg-[#070a11] text-slate-100 antialiased overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0a0e1a]">
          <div className="max-w-md w-full bg-[#0d1424] border border-[#1a2234] rounded-2xl p-8 text-center shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto mb-4">
              <Shield className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-white mb-2">Superadmin Access Required</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Organization administration is restricted to accounts configured in the SUPERADMIN_EMAILS environment.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setIsSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teamName.trim(),
          description: teamDescription.trim() || undefined,
          adminEmails: adminEmail.trim() ? [adminEmail.trim()] : [],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Failed to create team');
        return;
      }

      setTeamName('');
      setTeamDescription('');
      setAdminEmail('');
      setIsCreateModalOpen(false);
      await fetchTeams();
    } catch {
      setCreateError('Network error while creating team');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveTeam = async () => {
    if (!teamToArchive) return;
    setIsArchiving(true);
    setArchiveError(null);

    try {
      const res = await fetch(`/api/teams/${teamToArchive.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        setArchiveError(data.error || 'Failed to move team to limbo');
        return;
      }

      setTeamToArchive(null);
      await fetchTeams();
    } catch (err: any) {
      setArchiveError(err?.message || 'Network error moving team to limbo');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRestoreTeam = async (teamId: string) => {
    setRestoringId(teamId);
    try {
      const res = await fetch(`/api/teams/${teamId}/restore`, {
        method: 'POST',
      });

      if (res.ok) {
        await fetchTeams();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to restore team');
      }
    } catch {
      alert('Network error restoring team');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePurgeTeam = async (team: EnrichedTeam) => {
    const confirmed = confirm(
      `Permanently purge "${team.name}" immediately?\n\n` +
      `This will permanently delete the team record and audit logs from Firestore.\n\n` +
      `Published Knowledge Bases in Databricks Unity Catalog will NOT be deleted.`
    );
    if (!confirmed) return;

    setPurgingId(team.id);
    try {
      const res = await fetch(`/api/teams/${team.id}?permanent=true`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchTeams();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to purge team');
      }
    } catch {
      alert('Network error purging team');
    } finally {
      setPurgingId(null);
    }
  };

  const activeTeams = teams.filter((t) => t.status !== 'archived');
  const limboTeams = teams.filter((t) => t.status === 'archived');

  const displayedTeams = (activeTab === 'active' ? activeTeams : limboTeams).filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.adminEmails || []).some((a) => a.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-full w-full bg-[#070a11] text-slate-100 antialiased overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0e1a]">
        {/* Header */}
        <header className="px-6 py-4 border-b border-[#1a2234] bg-[#090d16] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white tracking-tight">Organization Command Center</h1>
                <span className="px-2 py-0.5 rounded-full bg-purple-900/30 border border-purple-500/30 text-[10px] font-semibold uppercase tracking-wider text-purple-300">
                  Superadmin
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Overview, lifecycle management, and governance for all workspace teams and administrators.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchTeams}
              disabled={loading}
              className="p-2 rounded-xl bg-[#131b2e] hover:bg-[#19243b] border border-[#22314d] text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Refresh teams"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => {
                setCreateError(null);
                setIsCreateModalOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create New Team</span>
            </button>
          </div>
        </header>

        {/* Stats Row */}
        <div className="px-6 py-4 border-b border-[#1a2234]/80 bg-[#080c16] grid grid-cols-4 gap-4 flex-shrink-0">
          <div className="bg-[#0e1424] border border-[#1a2234] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Active Teams</p>
              <p className="text-base font-bold text-white font-mono">{activeTeams.length}</p>
            </div>
          </div>

          <div className="bg-[#0e1424] border border-[#1a2234] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">30-Day Limbo</p>
              <p className="text-base font-bold text-amber-300 font-mono">{limboTeams.length}</p>
            </div>
          </div>

          <div className="bg-[#0e1424] border border-[#1a2234] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Total Teammates</p>
              <p className="text-base font-bold text-white font-mono">
                {activeTeams.reduce((acc, t) => acc + (t.memberCount || 0), 0)}
              </p>
            </div>
          </div>

          <div className="bg-[#0e1424] border border-[#1a2234] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Total Knowledge Bases</p>
              <p className="text-base font-bold text-white font-mono">
                {teams.reduce((acc, t) => acc + (t.kbCount || 0), 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="px-6 py-3 border-b border-[#1a2234]/60 bg-[#090d16] flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-[#101728] text-slate-400 hover:text-slate-200 border border-[#1a2234]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Active Teams</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'active' ? 'bg-blue-800 text-blue-100' : 'bg-slate-800 text-slate-400'
              }`}>
                {activeTeams.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('limbo')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'limbo'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'bg-[#101728] text-slate-400 hover:text-slate-200 border border-[#1a2234]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>30-Day Limbo</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'limbo' ? 'bg-amber-800 text-amber-100' : 'bg-slate-800 text-slate-400'
              }`}>
                {limboTeams.length}
              </span>
            </button>
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter teams by name or admin email..."
              className="w-full bg-[#0d1424] border border-[#1a2234] rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
        </div>

        {/* Tab Description Banner for Limbo */}
        {activeTab === 'limbo' && (
          <div className="px-6 py-3 bg-amber-950/20 border-b border-amber-500/20 flex items-center gap-3 text-xs text-amber-200/90 flex-shrink-0">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>30-Day Deletion Window:</strong> Archived teams are inactive with their members unassigned.
              Their upload history and logs are preserved for 30 days before permanent deletion.
              Published Markdown files in Databricks Unity Catalog remain fully active and accessible company-wide.
            </span>
          </div>
        )}

        {/* Teams Grid */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loadError && (
            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{loadError}</span>
              </div>
              <button
                onClick={fetchTeams}
                className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              <p className="text-xs">Loading organization teams...</p>
            </div>
          ) : displayedTeams.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-[#1a2234] rounded-2xl bg-[#0d1424]/40">
              {activeTab === 'limbo' ? (
                <>
                  <Clock className="w-10 h-10 stroke-1 text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-400">No teams in 30-day limbo</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Archived teams pending permanent deletion will appear here.
                  </p>
                </>
              ) : (
                <>
                  <Building2 className="w-10 h-10 stroke-1 text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-400">No active teams found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {searchQuery
                      ? `No teams matching "${searchQuery}"`
                      : 'Get started by creating your organization\'s first team.'}
                  </p>
                  {!searchQuery && (
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create First Team
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedTeams.map((team) => {
                const isArchived = team.status === 'archived';
                const purgeDate = team.scheduledPurgeAt ? new Date(team.scheduledPurgeAt) : null;
                const diffDays = purgeDate
                  ? Math.max(0, Math.ceil((purgeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                  : 30;

                return (
                  <div
                    key={team.id}
                    className={`bg-[#0e1424] border rounded-xl p-4 flex flex-col justify-between transition-all group hover:shadow-lg ${
                      isArchived
                        ? 'border-amber-500/30 hover:border-amber-500/60 hover:shadow-amber-950/20'
                        : 'border-[#1a2234] hover:border-purple-500/40 hover:shadow-purple-950/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isArchived
                            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                            : 'bg-purple-500/10 border border-purple-500/20 text-purple-400'
                        }`}>
                          {isArchived ? <Clock className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isArchived && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300">
                              {diffDays}d in Limbo
                            </span>
                          )}
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#131b2e] border border-[#22314d] text-slate-400">
                            {team.id}
                          </span>
                        </div>
                      </div>

                      <h3 className="text-sm font-semibold text-white tracking-tight mb-1">{team.name}</h3>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                        {team.description || 'No description provided.'}
                      </p>

                      <div className="border-t border-[#1a2234]/60 pt-2 mb-3 space-y-1.5 text-[11px]">
                        <div>
                          <span className="text-slate-500">Admins: </span>
                          <span className="text-slate-300 font-mono">
                            {team.adminEmails && team.adminEmails.length > 0
                              ? team.adminEmails.join(', ')
                              : 'None assigned'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400">
                          {!isArchived && (
                            <span>Members: <strong className="text-white font-mono">{team.memberCount ?? 0}</strong></span>
                          )}
                          <span>KBs History: <strong className="text-white font-mono">{team.kbCount ?? 0}</strong></span>
                        </div>

                        {isArchived && team.deletedBy && (
                          <div className="text-[10px] text-amber-300/80 font-mono">
                            Archived by: {team.deletedBy.email}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#1a2234] flex items-center justify-between text-xs">
                      <span className="text-[10px] text-slate-500">
                        {isArchived
                          ? `Scheduled Purge: ${purgeDate ? purgeDate.toLocaleDateString() : '30 days'}`
                          : `Created ${new Date(team.createdAt).toLocaleDateString()}`}
                      </span>

                      <div className="flex items-center gap-2">
                        {isArchived ? (
                          <>
                            <button
                              onClick={() => handleRestoreTeam(team.id)}
                              disabled={restoringId === team.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition-all cursor-pointer"
                              title="Restore team back to active status"
                            >
                              <RotateCcw className={`w-3 h-3 ${restoringId === team.id ? 'animate-spin' : ''}`} />
                              <span>Restore</span>
                            </button>

                            <button
                              onClick={() => handlePurgeTeam(team)}
                              disabled={purgingId === team.id}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Permanently purge now"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => router.push(`/team/members?teamId=${team.id}`)}
                              className="flex items-center gap-1 text-[11px] font-medium text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                            >
                              <span>Manage</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>

                            <button
                              onClick={() => {
                                setArchiveError(null);
                                setTeamToArchive(team);
                              }}
                              className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Move team to 30-day limbo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Move to 30-Day Limbo Modal */}
        {teamToArchive && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0c1220] border border-amber-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a2234] flex items-center justify-between bg-[#080c16]">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">Move Team to 30-Day Limbo</h3>
                </div>
                <button
                  onClick={() => setTeamToArchive(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {archiveError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{archiveError}</span>
                  </div>
                )}

                <div className="space-y-3 text-xs text-slate-300">
                  <p>
                    Are you sure you want to move <strong className="text-white">{teamToArchive.name}</strong> to the 30-day deletion limbo?
                  </p>

                  <div className="p-3 rounded-xl bg-[#090d16] border border-[#1a2234] space-y-2 text-[11px]">
                    <div className="flex items-start gap-2 text-slate-300">
                      <Users className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Unassign Members:</strong> All {teamToArchive.memberCount ?? 0} member(s) will be unassigned immediately so they can join or create new teams.
                      </span>
                    </div>

                    <div className="flex items-start gap-2 text-slate-300">
                      <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>30-Day Limbo Window:</strong> Team metadata, upload history, and audit logs are safely kept for 30 days. You can restore the team at any time.
                      </span>
                    </div>

                    <div className="flex items-start gap-2 text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Published KBs are Protected:</strong> All Markdown files in Databricks Unity Catalog remain untouched and accessible company-wide in "All Knowledge Bases".
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#1a2234]">
                  <button
                    type="button"
                    onClick={() => setTeamToArchive(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleArchiveTeam}
                    disabled={isArchiving}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-600/20 cursor-pointer"
                  >
                    {isArchiving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Archive className="w-3.5 h-3.5" />
                    )}
                    <span>{isArchiving ? 'Archiving...' : 'Move to 30-Day Limbo'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Team Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0c1220] border border-[#1a2234] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a2234] flex items-center justify-between bg-[#080c16]">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-semibold text-white">Create New Organization Team</h3>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateTeam} className="p-5 space-y-4">
                {createError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{createError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Team Name</label>
                  <input
                    type="text"
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Customer Support AI, Sales Enablement"
                    className="w-full bg-[#090d16] border border-[#1a2234] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-blue-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Description (Optional)</label>
                  <textarea
                    rows={2}
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                    placeholder="Brief description of the team's operational scope..."
                    className="w-full bg-[#090d16] border border-[#1a2234] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-blue-500/60"
                  />
                </div>

                <VerifiedEmailInput
                  label="Assign Initial Team Admin (Optional)"
                  placeholder="colleague@foodgroup.ph"
                  value={adminEmail}
                  onChange={(email, isValid) => {
                    setAdminEmail(email);
                    setIsAdminEmailValid(!email.trim() || isValid);
                  }}
                  helperText="Leave empty to manage later, or enter an authorized organization email."
                />

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !teamName.trim() || !isAdminEmailValid}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-600/20 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>{isSubmitting ? 'Creating...' : 'Create Team'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
