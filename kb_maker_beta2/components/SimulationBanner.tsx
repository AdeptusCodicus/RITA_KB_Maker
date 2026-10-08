'use client';

import React, { useState } from 'react';
import { Eye, LogOut, RefreshCw, ShieldAlert, Sparkles, Building2 } from 'lucide-react';
import { useAuth } from './AuthProvider';

export default function SimulationBanner() {
  const { session, switchDevEmail, refreshSession } = useAuth();
  const [isExiting, setIsExiting] = useState(false);

  if (!session?.isSimulating) return null;

  const handleExitSimulation = async () => {
    setIsExiting(true);
    try {
      await fetch('/api/auth/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_simulation' }),
      });
      await refreshSession();
    } catch (e) {
      console.error('Failed to exit simulation:', e);
    } finally {
      setIsExiting(false);
    }
  };

  const roleName = session.role.toUpperCase();

  const roleColor =
    session.role === 'superadmin'
      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
      : session.role === 'admin'
      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
      : session.role === 'editor'
      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
      : session.role === 'viewer'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

  return (
    <div className="w-full bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border-b border-purple-500/30 px-4 py-2 flex items-center justify-between text-xs z-40 shadow-lg flex-shrink-0">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-300 font-semibold text-[10px] tracking-wider uppercase">
          <Eye className="w-3 h-3 text-purple-400" />
          <span>Role Simulation Active</span>
        </div>

        <div className="flex items-center gap-2 text-slate-300 min-w-0">
          <span>Simulating:</span>
          <span className={`px-2 py-0.5 rounded font-mono font-semibold text-[11px] border ${roleColor}`}>
            {roleName}
          </span>
          {session.teamName && (
            <span className="flex items-center gap-1 text-slate-400 font-mono text-[11px] truncate">
              <Building2 className="w-3 h-3 text-slate-500 flex-shrink-0" />
              <span>{session.teamName}</span>
            </span>
          )}
          {session.realEmail && (
            <span className="text-[10px] text-slate-500 hidden md:inline truncate">
              (Authenticated as {session.realEmail})
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleExitSimulation}
        disabled={isExiting}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-semibold text-[11px] transition-all cursor-pointer shadow-md shadow-purple-600/30 flex-shrink-0 disabled:opacity-50"
      >
        {isExiting ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : (
          <LogOut className="w-3 h-3" />
        )}
        <span>Exit Simulation</span>
      </button>
    </div>
  );
}
