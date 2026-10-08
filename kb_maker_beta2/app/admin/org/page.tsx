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

  const fetchTeams = useCallback(async () => {
    if (!isSuperadmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/teams?_t=${Date.now()}`);
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
      <div className="flex h-screen bg-[#070a11] text-slate-100 antialiased overflow-hidden">
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

  const filteredTeams = teams.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      t.adminEmails.some((a) => a.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-screen bg-[#070a11] text-slate-100 antialiased overflow-hidden">
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
                Overview and governance of all organization teams, team administrators, and members.
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
        <div className="px-6 py-4 border-b border-[#1a2234]/80 bg-[#080c16] grid grid-cols-3 gap-4 flex-shrink-0">
          <div className="bg-[#0e1424] border border-[#1a2234] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Total Teams</p>
              <p className="text-base font-bold text-white font-mono">{teams.length}</p>
            </div>
          </div>

          <div className="bg-[#0e1424] border border-[#1a2234] rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Total Teammates</p>
              <p className="text-base font-bold text-white font-mono">
                {teams.reduce((acc, t) => acc + (t.memberCount || 0), 0)}
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

        {/* Filter Bar */}
        <div className="px-6 py-3 border-b border-[#1a2234]/60 bg-[#090d16] flex items-center justify-between gap-4 flex-shrink-0">
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
          ) : filteredTeams.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-[#1a2234] rounded-2xl bg-[#0d1424]/40">
              <Building2 className="w-10 h-10 stroke-1 text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-400">No teams found</p>
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
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTeams.map((team) => (
                <div
                  key={team.id}
                  className="bg-[#0e1424] border border-[#1a2234] hover:border-purple-500/40 rounded-xl p-4 flex flex-col justify-between transition-all group hover:shadow-lg hover:shadow-purple-950/20"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#131b2e] border border-[#22314d] text-slate-400">
                        {team.id}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-white tracking-tight mb-1">{team.name}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                      {team.description || 'No description provided.'}
                    </p>

                    <div className="border-t border-[#1a2234]/60 pt-2 mb-3 space-y-1.5 text-[11px]">
                      <div>
                        <span className="text-slate-500">Admins: </span>
                        <span className="text-slate-300 font-mono">
                          {team.adminEmails.length > 0 ? team.adminEmails.join(', ') : 'None assigned'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-slate-400">
                        <span>Members: <strong className="text-white font-mono">{team.memberCount ?? 0}</strong></span>
                        <span>KBs: <strong className="text-white font-mono">{team.kbCount ?? 0}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#1a2234] flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-500">
                      Created {new Date(team.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => router.push(`/team/members?teamId=${team.id}`)}
                      className="flex items-center gap-1 text-[11px] font-medium text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                    >
                      <span>Manage</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
