'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import VerifiedEmailInput from './VerifiedEmailInput';
import type { SearchUserItem } from '@/types/auth';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const { session, switchDevEmail, isSuperadmin, role, teamName } = useAuth();
  const [selectedEmail, setSelectedEmail] = useState('');
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!isOpen || !session) return null;

  const handleSwitchAccount = async () => {
    if (!selectedEmail.trim()) return;
    setIsSwitching(true);
    try {
      await switchDevEmail(selectedEmail.trim().toLowerCase());
      onClose();
    } finally {
      setIsSwitching(false);
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
    // Official Google Cloud Identity-Aware Proxy logout endpoint
    window.location.href = '/_gcp_iap/clear_login_cookie';
  };

  const roleBadgeStyle = isSuperadmin
    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
    : role === 'admin'
    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
    : role === 'editor'
    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
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
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar">
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
                  <span className="truncate max-w-[120px]">{teamName || 'Unassigned'}</span>
                </span>
              </div>
            </div>

            {/* Permissions Summary Banner */}
            <div className="pt-3 border-t border-[#1a2234]/60 grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Databricks Volume Read/Write</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>
                  {isSuperadmin
                    ? 'Global Organization Control'
                    : role === 'admin'
                    ? 'Team Admin & Audit Logs'
                    : role === 'editor'
                    ? 'Knowledge Base Author'
                    : 'Read-Only Viewer'}
                </span>
              </div>
            </div>
          </div>

          {/* Switch Account Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
                Switch Account / Role Simulation
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Dev Switcher</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Select or type any user within the organization directory to test their role-based workspace views.
            </p>

            <div className="space-y-3">
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
                onClick={handleSwitchAccount}
                disabled={!selectedEmail.trim() || !isEmailValid || isSwitching}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-600/20 cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>{isSwitching ? 'Switching Account...' : 'Switch Identity'}</span>
              </button>
            </div>
          </div>

          {/* Sign Out Options */}
          <div className="pt-4 border-t border-[#1a2234] space-y-2.5">
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
