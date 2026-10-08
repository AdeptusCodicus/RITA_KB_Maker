'use client';

import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, Mail, CheckCircle2, LogOut, Sparkles } from 'lucide-react';
import type { AuthSession } from '@/types/auth';
import VerifiedEmailInput from './VerifiedEmailInput';

interface AccessPendingGatekeeperProps {
  session: AuthSession;
  onRefresh: () => Promise<void>;
  onSwitchDevEmail?: (email: string | null) => Promise<void>;
}

export default function AccessPendingGatekeeper({
  session,
  onRefresh,
  onSwitchDevEmail,
}: AccessPendingGatekeeperProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [devInput, setDevInput] = useState('');
  const [isDevInputValid, setIsDevInputValid] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDevSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSwitchDevEmail || !devInput.trim()) return;
    await onSwitchDevEmail(devInput.trim());
    setDevInput('');
  };

  return (
    <div className="min-h-screen bg-[#070a11] text-slate-200 flex flex-col justify-between p-6 antialiased">
      {/* Header */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight leading-none">KB Maker</h1>
            <span className="text-[11px] text-slate-500 font-mono">RITA Assistant</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0d1424] border border-[#1a2234] text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px]">{session.email}</span>
          </div>
          {session.isSimulating && (
            <button
              onClick={() => {
                fetch('/api/auth/me', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'clear_simulation' }),
                }).then(() => onRefresh());
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-md shadow-purple-600/30"
              title="Exit simulation and return to your account"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit Simulation</span>
            </button>
          )}
          {onSwitchDevEmail && (
            <button
              onClick={() => onSwitchDevEmail(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0d1424] hover:bg-[#131b2e] border border-[#1a2234] text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Sign Out / Switch Account"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Card */}
      <div className="max-w-md w-full mx-auto my-auto bg-[#0d1424] border border-[#1a2234] rounded-2xl p-8 shadow-2xl shadow-black/60 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
          <ShieldAlert className="w-7 h-7 text-amber-400" />
        </div>

        <h2 className="text-xl font-semibold text-white tracking-tight mb-2">
          {session.isSimulating ? 'Simulating Unassigned Role' : 'Team Assignment Pending'}
        </h2>

        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          {session.isSimulating
            ? 'You are currently simulating what an unassigned organization employee experiences before being added to a team.'
            : 'Your Google account has been authenticated, but you have not been assigned to a team yet. Please contact an organization administrator to be granted access to your team workspace.'}
        </p>

        {/* Verification Status Pill */}
        <div className="bg-[#131b2e] border border-[#22314d] rounded-xl p-3 mb-6 text-left flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="text-[11px]">
            <p className="text-slate-200 font-medium">
              {session.isSimulating ? 'Active Simulation' : 'Identity Verified'}
            </p>
            <p className="text-slate-400 mt-0.5">
              {session.isSimulating ? (
                <>
                  Simulated Identity: <span className="font-mono text-slate-300">{session.email}</span>
                </>
              ) : (
                <>
                  Signed in as <span className="font-mono text-slate-300">{session.email}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          {session.isSimulating && (
            <button
              onClick={() => {
                fetch('/api/auth/me', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'clear_simulation' }),
                }).then(() => onRefresh());
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shadow-md shadow-purple-600/30 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit Simulation (Return to Superadmin)</span>
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Checking permissions...' : 'Check Access Status'}</span>
          </button>
        </div>

        {/* Local Dev Role Testing Helper (Active only in development or if switch handler exists) */}
        {onSwitchDevEmail && (
          <div className="mt-8 pt-6 border-t border-[#1a2234] text-left">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-2">
              Development Switcher
            </span>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <VerifiedEmailInput
                  value={devInput}
                  onChange={(email, isValid) => {
                    setDevInput(email);
                    setIsDevInputValid(isValid);
                  }}
                  placeholder="colleague@foodgroup.ph"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (devInput.trim() && isDevInputValid) {
                    await onSwitchDevEmail(devInput.trim());
                    setDevInput('');
                  }
                }}
                disabled={!devInput.trim() || !isDevInputValid}
                className="px-3.5 py-2.5 bg-[#19243b] hover:bg-[#22314d] border border-[#2a3c61] text-xs font-medium text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer flex-shrink-0"
              >
                Switch
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-md w-full mx-auto text-center text-[11px] text-slate-600">
        Knowledge Base Maker &bull; Google Cloud Identity-Aware Access
      </div>
    </div>
  );
}
