'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  LogOut,
  ShieldCheck,
  Building2,
  Mail,
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  Shield,
  Layers,
  Sparkles,
  RefreshCw,
  Eye,
  Sliders,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import VerifiedEmailInput from './VerifiedEmailInput';
import type { TeamDocument, UserRole } from '@/types/auth';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const { session, switchDevEmail, refreshSession, isSuperadmin, role, teamName } = useAuth();
  const [activeTab, setActiveTab] = useState<'role' | 'user'>('role');
  
  // Role Simulation state
  const [simRole, setSimRole] = useState<UserRole>('editor');
  const [teams, setTeams] = useState<TeamDocument[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [isSimulatingRole, setIsSimulatingRole] = useState(false);

  // User Simulation state
  const [selectedEmail, setSelectedEmail] = useState('');
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isSwitchingUser, setIsSwitchingUser] = useState(false);

  // General state
  const [isExitingSimulation, setIsExitingSimulation] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch available teams for the role simulation team selector
  useEffect(() => {
    if (!isOpen) return;
    async function loadTeams() {
      try {
        const res = await fetch(`/api/teams?_t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          const loaded: TeamDocument[] = data.teams || [];
          setTeams(loaded);
          if (loaded.length > 0 && !selectedTeamId) {
            setSelectedTeamId(loaded[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load teams for simulation modal:', e);
      }
    }
    loadTeams();
  }, [isOpen, selectedTeamId]);

  if (!isOpen || !session) return null;

  const handleSimulateRole = async () => {
    setIsSimulatingRole(true);
    setActionError(null);
    try {
      const chosenTeam = teams.find((t) => t.id === selectedTeamId);
      const res = await fetch('/api/auth/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_role',
          role: simRole,
          teamId: simRole === 'unassigned' || simRole === 'superadmin' ? null : selectedTeamId || null,
          teamName: simRole === 'unassigned' || simRole === 'superadmin' ? null : chosenTeam?.name || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || 'Failed to apply role simulation');
        return;
      }

      await refreshSession();
      onClose();
    } catch {
      setActionError('Network error while simulating role');
    } finally {
      setIsSimulatingRole(false);
    }
  };

  const handleSimulateUser = async () => {
    if (!selectedEmail.trim()) return;
    setIsSwitchingUser(true);
    setActionError(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_user',
          email: selectedEmail.trim().toLowerCase(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || 'Failed to simulate user');
        return;
      }

      await refreshSession();
      onClose();
    } catch {
      setActionError('Network error while simulating user');
    } finally {
      setIsSwitchingUser(false);
    }
  };

  const handleExitSimulation = async () => {
    setIsExitingSimulation(true);
    setActionError(null);
    try {
      await fetch('/api/auth/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_simulation' }),
      });
      await refreshSession();
      onClose();
    } catch {
      setActionError('Failed to exit simulation');
    } finally {
      setIsExitingSimulation(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await switchDevEmail(null);
      onClose();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleIapSignOut = () => {
    window.location.href = '/_gcp_iap/clear_login_cookie';
  };

  const roleBadgeStyle = isSuperadmin
    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
    : role === 'admin'
    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
    : role === 'editor'
    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    : role === 'viewer'
    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    : 'bg-slate-500/15 text-slate-300 border-slate-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-[#0d1424] border border-[#1a2234] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1a2234] flex items-center justify-between bg-[#090d16]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">
                Account & Workspace Session
              </h2>
              <p className="text-[11px] text-slate-500">
                Active Google identity and role permissions
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh] custom-scrollbar">
          {actionError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {actionError}
            </div>
          )}

          {/* Active Profile Card */}
          <div className="p-4 rounded-xl bg-[#090d16] border border-[#1a2234] space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-lg font-bold text-white shadow-md shadow-blue-500/20 flex-shrink-0">
                  {session.name ? session.name.charAt(0).toUpperCase() : session.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {session.name || session.email?.split('@')[0]}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mt-0.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{session.email}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md font-mono border ${roleBadgeStyle}`}>
                  {isSuperadmin ? 'Superadmin' : role}
                </span>
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-slate-500" />
                  <span className="truncate max-w-[130px]">{teamName || 'Unassigned'}</span>
                </span>
              </div>
            </div>

            {/* Simulation Active Indicator Banner */}
            {session.isSimulating && (
              <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-500/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-purple-300">
                  <Eye className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span>
                    Simulating as <strong>{role.toUpperCase()}</strong>
                    {session.realEmail ? ` (Auth: ${session.realEmail})` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleExitSimulation}
                  disabled={isExitingSimulation}
                  className="px-2.5 py-1 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  {isExitingSimulation ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <LogOut className="w-3 h-3" />
                  )}
                  <span>Exit Simulation</span>
                </button>
              </div>
            )}
          </div>

          {/* Role Simulation Section */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
                Role Simulation & Identity Switcher
              </label>
              <div className="flex items-center rounded-lg bg-[#090d16] p-0.5 border border-[#1a2234] text-[10px]">
                <button
                  type="button"
                  onClick={() => setActiveTab('role')}
                  className={`px-2.5 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                    activeTab === 'role'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  By Role
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('user')}
                  className={`px-2.5 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                    activeTab === 'user'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  By User Email
                </button>
              </div>
            </div>

            {activeTab === 'role' ? (
              <div className="p-3.5 rounded-xl bg-[#090d16] border border-[#1a2234] space-y-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                    Select Role to Simulate
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(['superadmin', 'admin', 'editor', 'viewer', 'unassigned'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSimRole(r)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium text-center capitalize transition-all cursor-pointer ${
                          simRole === r
                            ? 'bg-blue-600/20 border-blue-500/80 text-white font-semibold'
                            : 'bg-[#0d1424] border-[#1a2234] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {simRole !== 'unassigned' && simRole !== 'superadmin' && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                      Target Team for {simRole.toUpperCase()} Role
                    </label>
                    <select
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      className="w-full bg-[#0d1424] border border-[#1a2234] rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500/60"
                    >
                      {teams.length === 0 ? (
                        <option value="">No teams available (Create a team first)</option>
                      ) : (
                        teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.id})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSimulateRole}
                  disabled={isSimulatingRole}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition-all disabled:opacity-40 shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  {isSimulatingRole ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isSimulatingRole
                      ? 'Activating Simulation...'
                      : `Simulate as ${simRole.toUpperCase()}`}
                  </span>
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#090d16] border border-[#1a2234] space-y-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Type any user in the organization directory to test their exact workspace view and team membership.
                </p>

                <VerifiedEmailInput
                  value={selectedEmail}
                  onChange={(email, isValid) => {
                    setSelectedEmail(email);
                    setIsEmailValid(isValid);
                  }}
                  placeholder="colleague@foodgroup.ph"
                  helperText="Enter any authorized Google account from your organization."
                />

                <button
                  type="button"
                  onClick={handleSimulateUser}
                  disabled={!selectedEmail.trim() || !isEmailValid || isSwitchingUser}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  {isSwitchingUser ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  )}
                  <span>{isSwitchingUser ? 'Switching...' : 'Simulate User Identity'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Sign Out Options */}
          <div className="pt-3 border-t border-[#1a2234] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Session Controls</span>
              <span className="text-[10px] text-slate-500">End Active Session</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isSigningOut ? 'Signing out...' : 'Sign Out (Clear Session)'}</span>
              </button>

              <button
                type="button"
                onClick={handleIapSignOut}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#131b2e] hover:bg-[#19243b] border border-[#22314d] text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                title="Clears Google Cloud IAP proxy credentials"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                <span>GCP IAP Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1a2234] bg-[#090d16] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#131b2e] hover:bg-[#1a243d] border border-[#22314d] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
