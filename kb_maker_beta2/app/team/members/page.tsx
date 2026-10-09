'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Eye,
  Edit3,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Mail,
  Sparkles,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import VerifiedEmailInput from '@/components/VerifiedEmailInput';
import type { TeamMemberItem, TeamRole, TeamDocument } from '@/types/auth';

function TeamMembersContent() {
  const { session, role, isSuperadmin } = useAuth();
  const searchParams = useSearchParams();
  const queryTeamId = searchParams.get('teamId');

  const [teams, setTeams] = useState<TeamDocument[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(queryTeamId || session?.teamId || '');
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [inputEmail, setInputEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<TeamRole>('editor');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const canManageMembers = isSuperadmin || role === 'admin';

  // Load teams list if superadmin
  useEffect(() => {
    if (isSuperadmin) {
      fetch(`/api/teams?_t=${Date.now()}`)
        .then((r) => r.json())
        .then((d) => {
          const loaded: TeamDocument[] = d.teams || [];
          setTeams(loaded);
          if (!selectedTeamId && loaded.length > 0) {
            setSelectedTeamId(queryTeamId || loaded[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isSuperadmin, queryTeamId, selectedTeamId]);

  useEffect(() => {
    if (queryTeamId) {
      setSelectedTeamId(queryTeamId);
    }
  }, [queryTeamId]);

  const activeTeamId = selectedTeamId || session?.teamId || '';

  const fetchMembers = useCallback(async () => {
    const targetTeam = activeTeamId;
    if (!targetTeam) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${targetTeam}/members?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (e) {
      console.error('Failed to load team members:', e);
    } finally {
      setLoading(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmail.trim()) return;

    setIsSubmitting(true);
    setAddError(null);

    try {
      const targetTeam = activeTeamId;
      if (!targetTeam) return;
      const res = await fetch(`/api/teams/${targetTeam}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inputEmail.trim(),
          role: selectedRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAddError(data.error || 'Failed to add member');
        return;
      }

      // Success
      setInputEmail('');
      setSelectedRole('editor');
      setIsAddModalOpen(false);
      await fetchMembers();
    } catch {
      setAddError('Network error while adding member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (memberEmail: string, newRole: TeamRole) => {
    try {
      const targetTeam = activeTeamId;
      if (!targetTeam) return;
      const res = await fetch(
        `/api/teams/${targetTeam}/members/${encodeURIComponent(memberEmail)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.email === memberEmail ? { ...m, teamRole: newRole } : m
          )
        );
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update role');
      }
    } catch {
      alert('Network error while updating role');
    }
  };

  const handleRemoveMember = async (memberEmail: string) => {
    if (!confirm(`Are you sure you want to remove ${memberEmail} from this team?`)) return;

    try {
      const targetTeam = activeTeamId;
      if (!targetTeam) return;
      const res = await fetch(
        `/api/teams/${targetTeam}/members/${encodeURIComponent(memberEmail)}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.email !== memberEmail));
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to remove member');
      }
    } catch {
      alert('Network error while removing member');
    }
  };

  const filteredMembers = members.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.email.toLowerCase().includes(q) ||
      (m.name && m.name.toLowerCase().includes(q))
    );
  });

  const currentTeamObj = teams.find((t) => t.id === activeTeamId);

  return (
    <div className="flex h-full w-full bg-[#070a11] text-slate-100 antialiased overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0e1a]">
        {/* Header */}
        <header className="px-6 py-4 border-b border-[#1a2234] bg-[#090d16] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white tracking-tight">Team Teammates & Roles</h1>
                {isSuperadmin && teams.length > 0 ? (
                  <select
                    value={activeTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="px-2.5 py-0.5 rounded-full bg-indigo-900/40 border border-indigo-500/50 text-[11px] font-medium text-indigo-200 outline-none cursor-pointer"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id} className="bg-[#0d1424] text-slate-200">
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-900/30 border border-indigo-500/30 text-[11px] font-medium text-indigo-300">
                    {currentTeamObj?.name || session?.teamName || 'Your Team'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {canManageMembers
                  ? 'Manage team members, invite colleagues, and control access permissions.'
                  : 'Directory of colleagues and administrators in your workspace.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchMembers}
              disabled={loading}
              className="p-2 rounded-xl bg-[#131b2e] hover:bg-[#19243b] border border-[#22314d] text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Refresh roster"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {canManageMembers && (
              <button
                onClick={() => {
                  setAddError(null);
                  setIsAddModalOpen(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Teammate</span>
              </button>
            )}
          </div>
        </header>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-[#1a2234]/80 bg-[#080c16] flex items-center justify-between gap-4 flex-shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter teammates by name or Google email..."
              className="w-full bg-[#0d1424] border border-[#1a2234] rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Members:</span>
            <span className="font-mono font-medium text-slate-200 bg-[#131b2e] px-2 py-0.5 rounded-md border border-[#22314d]">
              {members.length}
            </span>
          </div>
        </div>

        {/* Member Table */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              <p className="text-xs">Loading team roster...</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-[#1a2234] rounded-2xl bg-[#0d1424]/40">
              <Users className="w-10 h-10 stroke-1 text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-400">No teammates found</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery
                  ? `No members matching "${searchQuery}"`
                  : 'Add team members using the "Add Teammate" button.'}
              </p>
            </div>
          ) : (
            <div className="bg-[#0e1424] border border-[#1a2234] rounded-xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1a2234] bg-[#090d16] text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    {canManageMembers && <th className="px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2234]/60">
                  {filteredMembers.map((member) => {
                    const isSelf = member.email === session?.email;
                    const isAdmin = member.teamRole === 'admin';

                    return (
                      <tr key={member.email} className="hover:bg-[#131b2e]/60 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-semibold text-slate-300 text-xs">
                              {member.name ? member.name.charAt(0).toUpperCase() : member.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-200">
                                {member.name || member.email.split('@')[0]}
                                {isSelf && (
                                  <span className="ml-1.5 text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                    You
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] font-mono text-slate-400 mt-0.5">{member.email}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {canManageMembers && !isAdmin ? (
                            <select
                              value={member.teamRole}
                              onChange={(e) => handleRoleChange(member.email, e.target.value as TeamRole)}
                              className="bg-[#090d16] border border-[#1a2234] rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-blue-500/60"
                            >
                              <option value="editor">Editor (Can add/edit/delete)</option>
                              <option value="viewer">Viewer (Read-only)</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border ${
                                member.teamRole === 'admin'
                                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                                  : member.teamRole === 'editor'
                                  ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                                  : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                              }`}
                            >
                              {member.teamRole === 'admin' ? (
                                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                              ) : member.teamRole === 'editor' ? (
                                <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                              ) : (
                                <Eye className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              <span className="capitalize">{member.teamRole}</span>
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Active
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                          {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'N/A'}
                        </td>

                        {canManageMembers && (
                          <td className="px-4 py-3.5 text-right">
                            {!isAdmin && !isSelf && (
                              <button
                                onClick={() => handleRemoveMember(member.email)}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Remove member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Member Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0c1220] border border-[#1a2234] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a2234] flex items-center justify-between bg-[#080c16]">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Add Teammate to Workspace</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddMember} className="p-5 space-y-4">
                {addError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{addError}</span>
                  </div>
                )}

                <VerifiedEmailInput
                  label="Colleague Email Address"
                  placeholder="colleague@foodgroup.ph"
                  value={inputEmail}
                  onChange={(email, isValid) => {
                    setInputEmail(email);
                    setIsEmailValid(isValid);
                  }}
                  currentTeamId={session?.teamId || undefined}
                  required
                  autoFocus
                  helperText="Enter any authorized Google account from your organization."
                />

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Role & Permissions
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedRole === 'editor'
                          ? 'bg-blue-950/40 border-blue-500/50 text-white'
                          : 'bg-[#090d16] border-[#1a2234] text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                          Editor
                        </span>
                        <input
                          type="radio"
                          name="role"
                          value="editor"
                          checked={selectedRole === 'editor'}
                          onChange={() => setSelectedRole('editor')}
                          className="accent-blue-600"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Can add, edit, and delete team KBs.
                      </span>
                    </label>

                    <label
                      className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedRole === 'viewer'
                          ? 'bg-blue-950/40 border-blue-500/50 text-white'
                          : 'bg-[#090d16] border-[#1a2234] text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          Viewer
                        </span>
                        <input
                          type="radio"
                          name="role"
                          value="viewer"
                          checked={selectedRole === 'viewer'}
                          onChange={() => setSelectedRole('viewer')}
                          className="accent-blue-600"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Read-only access to team and shared KBs.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !inputEmail.trim() || !isEmailValid}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-600/20 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    <span>{isSubmitting ? 'Verifying...' : 'Add to Team'}</span>
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

export default function TeamMembersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full bg-[#070a11] text-slate-100 antialiased overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center bg-[#0a0e1a]">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          </main>
        </div>
      }
    >
      <TeamMembersContent />
    </Suspense>
  );
}
