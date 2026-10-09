'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
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
  ArrowUp,
  ArrowDown,
  UserCheck,
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

  // Admin Succession Modal State (when removing sole admin)
  const [isSuccessionModalOpen, setIsSuccessionModalOpen] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<TeamMemberItem | null>(null);
  const [successionPlan, setSuccessionPlan] = useState<'promote' | 'new' | 'unassigned'>('promote');
  const [selectedPromoteEmail, setSelectedPromoteEmail] = useState<string>('');
  const [newAdminEmail, setNewAdminEmail] = useState<string>('');
  const [isNewAdminEmailValid, setIsNewAdminEmailValid] = useState<boolean>(false);
  const [isRemovingAdmin, setIsRemovingAdmin] = useState<boolean>(false);
  const [successionError, setSuccessionError] = useState<string | null>(null);

  // Assign Admin Modal State (when team has NO admin)
  const [isAssignAdminModalOpen, setIsAssignAdminModalOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'promote' | 'new'>('promote');
  const [promoteMemberEmail, setPromoteMemberEmail] = useState<string>('');
  const [assignAdminEmail, setAssignAdminEmail] = useState<string>('');
  const [isAssignAdminEmailValid, setIsAssignAdminEmailValid] = useState<boolean>(false);
  const [isAssigningAdmin, setIsAssigningAdmin] = useState<boolean>(false);
  const [assignAdminError, setAssignAdminError] = useState<string | null>(null);

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

  const adminCount = members.filter((m) => m.teamRole === 'admin').length;
  const hasNoAdmin = !loading && Boolean(activeTeamId) && adminCount === 0;

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

  const handlePromoteOrDemote = async (member: TeamMemberItem, targetRole: TeamRole) => {
    if (member.teamRole === 'admin' && targetRole !== 'admin') {
      if (adminCount <= 1) {
        const proceed = confirm(
          `Warning: ${member.name || member.email} is currently the only administrator of this team. Demoting them will leave the team without an active administrator until a Superadmin assigns one. Do you want to proceed?`
        );
        if (!proceed) return;
      }
    }
    await handleRoleChange(member.email, targetRole);
  };

  const handleRemoveMember = async (member: TeamMemberItem) => {
    const isAdmin = member.teamRole === 'admin';

    // If removing the sole/last admin of the team, trigger succession modal
    if (isAdmin && adminCount <= 1) {
      setAdminToRemove(member);
      const otherMembers = members.filter((m) => m.email !== member.email);
      if (otherMembers.length > 0) {
        setSuccessionPlan('promote');
        setSelectedPromoteEmail(otherMembers[0].email);
      } else {
        setSuccessionPlan('new');
        setSelectedPromoteEmail('');
      }
      setNewAdminEmail('');
      setIsNewAdminEmailValid(false);
      setSuccessionError(null);
      setIsSuccessionModalOpen(true);
      return;
    }

    const confirmMsg = isAdmin
      ? `Are you sure you want to remove administrator ${member.name || member.email} from this team?`
      : `Are you sure you want to remove ${member.name || member.email} from this team?`;

    if (!confirm(confirmMsg)) return;

    try {
      const targetTeam = activeTeamId;
      if (!targetTeam) return;
      const res = await fetch(
        `/api/teams/${targetTeam}/members/${encodeURIComponent(member.email)}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.email !== member.email));
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to remove member');
      }
    } catch {
      alert('Network error while removing member');
    }
  };

  const handleExecuteSuccession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToRemove || !activeTeamId) return;

    setIsRemovingAdmin(true);
    setSuccessionError(null);

    try {
      const body: { promoteEmail?: string; newAdminEmail?: string } = {};
      if (successionPlan === 'promote') {
        if (!selectedPromoteEmail) {
          setSuccessionError('Please select an existing team member to promote.');
          setIsRemovingAdmin(false);
          return;
        }
        body.promoteEmail = selectedPromoteEmail;
      } else if (successionPlan === 'new') {
        if (!newAdminEmail.trim() || !isNewAdminEmailValid) {
          setSuccessionError('Please enter a valid organization email address for the new administrator.');
          setIsRemovingAdmin(false);
          return;
        }
        body.newAdminEmail = newAdminEmail.trim();
      }

      const res = await fetch(
        `/api/teams/${activeTeamId}/members/${encodeURIComponent(adminToRemove.email)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setSuccessionError(data.error || 'Failed to remove administrator and execute succession plan');
        return;
      }

      setIsSuccessionModalOpen(false);
      setAdminToRemove(null);
      await fetchMembers();
    } catch (err: any) {
      setSuccessionError(err?.message || 'Network error executing succession plan');
    } finally {
      setIsRemovingAdmin(false);
    }
  };

  const handleAssignAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId) return;

    setIsAssigningAdmin(true);
    setAssignAdminError(null);

    try {
      if (assignMode === 'promote') {
        if (!promoteMemberEmail) {
          setAssignAdminError('Please select an existing team member to promote.');
          setIsAssigningAdmin(false);
          return;
        }

        const res = await fetch(
          `/api/teams/${activeTeamId}/members/${encodeURIComponent(promoteMemberEmail)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'admin' }),
          }
        );

        const data = await res.json();
        if (!res.ok) {
          setAssignAdminError(data.error || 'Failed to promote member to administrator');
          return;
        }
      } else {
        if (!assignAdminEmail.trim() || !isAssignAdminEmailValid) {
          setAssignAdminError('Please enter a valid organization email address.');
          setIsAssigningAdmin(false);
          return;
        }

        const res = await fetch(`/api/teams/${activeTeamId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: assignAdminEmail.trim(),
            role: 'admin',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setAssignAdminError(data.error || 'Failed to assign administrator');
          return;
        }
      }

      setIsAssignAdminModalOpen(false);
      setAssignAdminEmail('');
      setPromoteMemberEmail('');
      await fetchMembers();
    } catch (err: any) {
      setAssignAdminError(err?.message || 'Network error assigning administrator');
    } finally {
      setIsAssigningAdmin(false);
    }
  };

  const openAssignAdminModal = () => {
    setAssignAdminError(null);
    setAssignAdminEmail('');
    setIsAssignAdminEmailValid(false);
    if (members.length > 0) {
      setAssignMode('promote');
      setPromoteMemberEmail(members[0].email);
    } else {
      setAssignMode('new');
      setPromoteMemberEmail('');
    }
    setIsAssignAdminModalOpen(true);
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
  const otherMembersForSuccession = adminToRemove
    ? members.filter((m) => m.email !== adminToRemove.email)
    : [];

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
                  ? 'Manage team members, promote/demote roles, and govern workspace leadership.'
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

            {/* Quick Assign Administrator Button for Superadmin if Team Has No Admin */}
            {isSuperadmin && hasNoAdmin && (
              <button
                onClick={openAssignAdminModal}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-xs font-semibold transition-all shadow-md shadow-purple-600/20 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Assign Administrator</span>
              </button>
            )}

            {canManageMembers && (
              <button
                onClick={() => {
                  setAddError(null);
                  if (hasNoAdmin && isSuperadmin) {
                    setSelectedRole('admin');
                  } else {
                    setSelectedRole('editor');
                  }
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

        {/* Leadership Needed Alert Banner (when team has NO admin) */}
        {isSuperadmin && hasNoAdmin && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between gap-4 flex-shrink-0 shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-amber-300">
                  Leadership Needed: Team Has No Administrator
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  The previous administrator was removed or demoted. You can promote an existing team member or assign a new colleague from your organization.
                </p>
              </div>
            </div>

            <button
              onClick={openAssignAdminModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-semibold transition-all shadow-md shadow-amber-600/20 cursor-pointer flex-shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Assign Administrator</span>
            </button>
          </div>
        )}

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
                          {isSuperadmin ? (
                            <div className="relative inline-flex items-center">
                              <div className="pointer-events-none absolute left-2.5 flex items-center text-slate-400">
                                {member.teamRole === 'admin' ? (
                                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                                ) : member.teamRole === 'editor' ? (
                                  <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                              <select
                                value={member.teamRole}
                                onChange={(e) => handlePromoteOrDemote(member, e.target.value as TeamRole)}
                                className="bg-[#090d16] border border-[#1a2234] rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 outline-none focus:border-purple-500/60 font-medium cursor-pointer"
                              >
                                <option value="admin">Admin (Team Lead)</option>
                                <option value="editor">Editor (Can manage KBs)</option>
                                <option value="viewer">Viewer (Read-only)</option>
                              </select>
                            </div>
                          ) : canManageMembers && !isAdmin ? (
                            <div className="relative inline-flex items-center">
                              <div className="pointer-events-none absolute left-2.5 flex items-center text-slate-400">
                                {member.teamRole === 'editor' ? (
                                  <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                              <select
                                value={member.teamRole}
                                onChange={(e) => handlePromoteOrDemote(member, e.target.value as TeamRole)}
                                className="bg-[#090d16] border border-[#1a2234] rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 outline-none focus:border-blue-500/60 font-medium cursor-pointer"
                              >
                                <option value="editor">Editor (Can manage KBs)</option>
                                <option value="viewer">Viewer (Read-only)</option>
                              </select>
                            </div>
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
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Promote / Demote Action Buttons */}
                              {isSuperadmin ? (
                                <>
                                  {member.teamRole === 'viewer' && (
                                    <button
                                      onClick={() => handlePromoteOrDemote(member, 'editor')}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 text-[10px] font-medium transition-all cursor-pointer"
                                      title="Promote to Editor (Manage KBs)"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                      <span>Promote to Editor</span>
                                    </button>
                                  )}
                                  {member.teamRole === 'editor' && (
                                    <>
                                      <button
                                        onClick={() => handlePromoteOrDemote(member, 'admin')}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 hover:border-purple-500/40 text-[10px] font-medium transition-all cursor-pointer"
                                        title="Promote to Admin (Lead Team)"
                                      >
                                        <ShieldCheck className="w-3 h-3 text-purple-400" />
                                        <span>Promote to Admin</span>
                                      </button>
                                      <button
                                        onClick={() => handlePromoteOrDemote(member, 'viewer')}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 border border-slate-700/60 text-[10px] font-medium transition-all cursor-pointer"
                                        title="Demote to Viewer (Read-only)"
                                      >
                                        <ArrowDown className="w-3 h-3" />
                                        <span>Demote to Viewer</span>
                                      </button>
                                    </>
                                  )}
                                  {member.teamRole === 'admin' && (
                                    <button
                                      onClick={() => handlePromoteOrDemote(member, 'editor')}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 hover:border-amber-500/40 text-[10px] font-medium transition-all cursor-pointer"
                                      title="Demote to Editor"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                      <span>Demote to Editor</span>
                                    </button>
                                  )}
                                </>
                              ) : role === 'admin' && !isAdmin ? (
                                <>
                                  {member.teamRole === 'viewer' && (
                                    <button
                                      onClick={() => handlePromoteOrDemote(member, 'editor')}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 text-[10px] font-medium transition-all cursor-pointer"
                                      title="Assign as Editor"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Assign as Editor</span>
                                    </button>
                                  )}
                                  {member.teamRole === 'editor' && (
                                    <button
                                      onClick={() => handlePromoteOrDemote(member, 'viewer')}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 border border-slate-700/60 text-[10px] font-medium transition-all cursor-pointer"
                                      title="Assign as Viewer"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>Assign as Viewer</span>
                                    </button>
                                  )}
                                </>
                              ) : null}

                              {/* Remove Member Button */}
                              {(isSuperadmin || (!isAdmin && !isSelf)) && (
                                <button
                                  onClick={() => handleRemoveMember(member)}
                                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                  title={isAdmin ? 'Remove administrator' : 'Remove member'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
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
                  <div className={`grid gap-2 ${isSuperadmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {isSuperadmin && (
                      <label
                        className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedRole === 'admin'
                            ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-sm ring-1 ring-purple-500/30'
                            : 'bg-[#090d16] border-[#1a2234] text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs flex items-center gap-1.5 text-purple-300">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                            Admin
                          </span>
                          <input
                            type="radio"
                            name="role"
                            value="admin"
                            checked={selectedRole === 'admin'}
                            onChange={() => setSelectedRole('admin')}
                            className="accent-purple-600"
                          />
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Team lead. Manages teammates & KBs.
                        </span>
                      </label>
                    )}

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

        {/* Assign Administrator Modal (When team has NO admin) */}
        {isAssignAdminModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0c1220] border border-purple-500/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a2234] flex items-center justify-between bg-[#080c16]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Assign Administrator for {currentTeamObj?.name || 'Team'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsAssignAdminModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAssignAdminSubmit} className="p-5 space-y-4">
                <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs text-slate-300 leading-relaxed">
                  This workspace currently has no active administrator. Assign a team leader to govern permissions and workspace data:
                </div>

                {assignAdminError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{assignAdminError}</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  {/* Option 1: Promote existing teammate */}
                  <label
                    className={`block p-3.5 rounded-xl border transition-all cursor-pointer ${
                      members.length === 0
                        ? 'opacity-40 cursor-not-allowed bg-[#090d16] border-[#1a2234]'
                        : assignMode === 'promote'
                        ? 'bg-purple-950/40 border-purple-500/60 shadow-md ring-1 ring-purple-500/30'
                        : 'bg-[#090d16] border-[#1a2234] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-semibold text-white">
                          Promote an Existing Teammate
                        </span>
                      </div>
                      <input
                        type="radio"
                        name="assignMode"
                        value="promote"
                        disabled={members.length === 0}
                        checked={assignMode === 'promote'}
                        onChange={() => setAssignMode('promote')}
                        className="accent-purple-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      {members.length > 0
                        ? 'Choose a current team member to elevate to Administrator.'
                        : 'No existing teammates on this team to promote.'}
                    </p>

                    {assignMode === 'promote' && members.length > 0 && (
                      <select
                        value={promoteMemberEmail}
                        onChange={(e) => setPromoteMemberEmail(e.target.value)}
                        className="w-full mt-2 bg-[#0d1424] border border-purple-500/40 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-purple-400"
                      >
                        {members.map((m) => (
                          <option key={m.email} value={m.email} className="bg-[#0d1424] text-slate-200">
                            {m.name ? `${m.name} (${m.email})` : m.email} — current {m.teamRole}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>

                  {/* Option 2: Add and assign a new colleague */}
                  <label
                    className={`block p-3.5 rounded-xl border transition-all cursor-pointer ${
                      assignMode === 'new'
                        ? 'bg-purple-950/40 border-purple-500/60 shadow-md ring-1 ring-purple-500/30'
                        : 'bg-[#090d16] border-[#1a2234] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-semibold text-white">
                          Assign New Colleague from Organization
                        </span>
                      </div>
                      <input
                        type="radio"
                        name="assignMode"
                        value="new"
                        checked={assignMode === 'new'}
                        onChange={() => setAssignMode('new')}
                        className="accent-purple-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Add a verified Google Workspace colleague directly as the new Administrator.
                    </p>

                    {assignMode === 'new' && (
                      <div className="mt-2">
                        <VerifiedEmailInput
                          label="Colleague Email Address"
                          placeholder="colleague@foodgroup.ph"
                          value={assignAdminEmail}
                          onChange={(email, isValid) => {
                            setAssignAdminEmail(email);
                            setIsAssignAdminEmailValid(isValid);
                          }}
                          currentTeamId={activeTeamId}
                          required
                          autoFocus
                          helperText="Must be an authorized Google Workspace account in your organization."
                        />
                      </div>
                    )}
                  </label>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#1a2234]">
                  <button
                    type="button"
                    onClick={() => setIsAssignAdminModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isAssigningAdmin ||
                      (assignMode === 'promote' && !promoteMemberEmail) ||
                      (assignMode === 'new' && (!assignAdminEmail.trim() || !isAssignAdminEmailValid))
                    }
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-purple-600/20 cursor-pointer"
                  >
                    {isAssigningAdmin ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>{isAssigningAdmin ? 'Assigning...' : 'Assign as Administrator'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Admin Succession Modal */}
        {isSuccessionModalOpen && adminToRemove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0c1220] border border-purple-500/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a2234] flex items-center justify-between bg-[#080c16]">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-purple-400" />
                  <h3 className="text-sm font-semibold text-white">Administrator Succession Plan</h3>
                </div>
                <button
                  onClick={() => setIsSuccessionModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleExecuteSuccession} className="p-5 space-y-4">
                <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs space-y-1">
                  <p className="font-semibold text-purple-300">
                    Removing Sole Administrator: {adminToRemove.name || adminToRemove.email}
                  </p>
                  <p className="text-slate-300 leading-relaxed">
                    This user is currently the sole administrator for{' '}
                    <strong className="text-white">{currentTeamObj?.name || 'this team'}</strong>.
                    Teams require leadership to govern permissions and workspace data. Please choose a succession action:
                  </p>
                </div>

                {successionError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{successionError}</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  {/* Option 1: Promote an existing teammate */}
                  <label
                    className={`block p-3.5 rounded-xl border transition-all cursor-pointer ${
                      otherMembersForSuccession.length === 0
                        ? 'opacity-40 cursor-not-allowed bg-[#090d16] border-[#1a2234]'
                        : successionPlan === 'promote'
                        ? 'bg-purple-950/40 border-purple-500/60 shadow-md ring-1 ring-purple-500/30'
                        : 'bg-[#090d16] border-[#1a2234] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-semibold text-white">
                          Promote Existing Teammate to Admin
                        </span>
                      </div>
                      <input
                        type="radio"
                        name="successionPlan"
                        value="promote"
                        disabled={otherMembersForSuccession.length === 0}
                        checked={successionPlan === 'promote'}
                        onChange={() => setSuccessionPlan('promote')}
                        className="accent-purple-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      {otherMembersForSuccession.length > 0
                        ? 'Select an existing colleague on this team to take over administrator privileges.'
                        : 'No other members currently exist on this team to promote.'}
                    </p>

                    {successionPlan === 'promote' && otherMembersForSuccession.length > 0 && (
                      <select
                        value={selectedPromoteEmail}
                        onChange={(e) => setSelectedPromoteEmail(e.target.value)}
                        className="w-full mt-2 bg-[#0d1424] border border-purple-500/40 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-purple-400"
                      >
                        {otherMembersForSuccession.map((m) => (
                          <option key={m.email} value={m.email} className="bg-[#0d1424] text-slate-200">
                            {m.name ? `${m.name} (${m.email})` : m.email} — current {m.teamRole}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>

                  {/* Option 2: Assign a new colleague */}
                  <label
                    className={`block p-3.5 rounded-xl border transition-all cursor-pointer ${
                      successionPlan === 'new'
                        ? 'bg-purple-950/40 border-purple-500/60 shadow-md ring-1 ring-purple-500/30'
                        : 'bg-[#090d16] border-[#1a2234] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-semibold text-white">
                          Assign New Colleague from Organization as Admin
                        </span>
                      </div>
                      <input
                        type="radio"
                        name="successionPlan"
                        value="new"
                        checked={successionPlan === 'new'}
                        onChange={() => setSuccessionPlan('new')}
                        className="accent-purple-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Invite a verified colleague from your organization to lead this team.
                    </p>

                    {successionPlan === 'new' && (
                      <div className="mt-2">
                        <VerifiedEmailInput
                          label="New Admin Colleague Email"
                          placeholder="colleague@foodgroup.ph"
                          value={newAdminEmail}
                          onChange={(email, isValid) => {
                            setNewAdminEmail(email);
                            setIsNewAdminEmailValid(isValid);
                          }}
                          required
                          autoFocus
                          helperText="Must be a verified Google Workspace account in your organization."
                        />
                      </div>
                    )}
                  </label>

                  {/* Option 3: Remove without replacement */}
                  <label
                    className={`block p-3.5 rounded-xl border transition-all cursor-pointer ${
                      successionPlan === 'unassigned'
                        ? 'bg-rose-950/40 border-rose-500/60 shadow-md ring-1 ring-rose-500/30'
                        : 'bg-[#090d16] border-[#1a2234] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-rose-400" />
                        <span className="text-xs font-semibold text-rose-300">
                          Remove Admin & Leave Team Unstaffed / Leaderless
                        </span>
                      </div>
                      <input
                        type="radio"
                        name="successionPlan"
                        value="unassigned"
                        checked={successionPlan === 'unassigned'}
                        onChange={() => setSuccessionPlan('unassigned')}
                        className="accent-rose-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      The administrator will be removed immediately. The team will remain without an administrator until a Superadmin assigns one.
                    </p>
                  </label>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#1a2234]">
                  <button
                    type="button"
                    onClick={() => setIsSuccessionModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isRemovingAdmin ||
                      (successionPlan === 'promote' && !selectedPromoteEmail) ||
                      (successionPlan === 'new' && (!newAdminEmail.trim() || !isNewAdminEmailValid))
                    }
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-rose-600/20 cursor-pointer"
                  >
                    {isRemovingAdmin ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>{isRemovingAdmin ? 'Processing...' : 'Confirm & Remove Administrator'}</span>
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
