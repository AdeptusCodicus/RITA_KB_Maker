'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Loader2, ShieldCheck, Sparkles, LogIn } from 'lucide-react';
import type { AuthSession, UserRole } from '@/types/auth';
import AccessPendingGatekeeper from './AccessPendingGatekeeper';

interface AuthContextType {
  session: AuthSession | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  switchDevEmail: (email: string | null) => Promise<void>;
  isSuperadmin: boolean;
  role: UserRole;
  teamId: string | null;
  teamName: string | null;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  refreshSession: async () => {},
  switchDevEmail: async () => {},
  isSuperadmin: false,
  role: 'unassigned',
  teamId: null,
  teamName: null,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/auth/me?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data: AuthSession = await res.json();
        setSession(data);
      } else {
        setSession({
          authenticated: false,
          email: null,
          name: null,
          isSuperadmin: false,
          teamId: null,
          teamName: null,
          role: 'unassigned',
          status: 'unauthenticated',
        });
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      setSession({
        authenticated: false,
        email: null,
        name: null,
        isSuperadmin: false,
        teamId: null,
        teamName: null,
        role: 'unassigned',
        status: 'unauthenticated',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const switchDevEmail = useCallback(
    async (email: string | null) => {
      setLoading(true);
      try {
        await fetch('/api/auth/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ devEmail: email }),
        });
        await fetchSession();
      } catch (err) {
        console.error('Failed to switch dev email:', err);
      } finally {
        setLoading(false);
      }
    },
    [fetchSession]
  );

  // Full page dark loader
  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#070a11] flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4 animate-pulse">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          <span>Authenticating user...</span>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!session || !session.authenticated) {
    return (
      <div className="min-h-screen bg-[#070a11] text-slate-200 flex flex-col justify-between p-6 antialiased">
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
        </div>

        <div className="max-w-md w-full mx-auto my-auto bg-[#0d1424] border border-[#1a2234] rounded-2xl p-8 shadow-2xl shadow-black/60 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6">
            <LogIn className="w-7 h-7 text-blue-400" />
          </div>

          <h2 className="text-xl font-semibold text-white tracking-tight mb-2">
            Authentication Required
          </h2>

          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            Please sign in with your authorized Google Workspace account or access this site through Google Cloud Identity-Aware Proxy.
          </p>

          {/* Dev Mode Simulator */}
          <div className="mt-4 pt-4 border-t border-[#1a2234] text-left">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-2">
              Development Sign-In Simulator
            </span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const input = form.elements.namedItem('devEmail') as HTMLInputElement;
                if (input && input.value) {
                  switchDevEmail(input.value);
                }
              }}
              className="flex gap-2"
            >
              <input
                type="email"
                name="devEmail"
                placeholder="admin@your-company.com"
                required
                className="flex-1 bg-[#090d16] border border-[#1a2234] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500/60"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>

        <div className="max-w-md w-full mx-auto text-center text-[11px] text-slate-600">
          Knowledge Base Maker &bull; Google Cloud Identity-Aware Access
        </div>
      </div>
    );
  }

  // Unassigned user gatekeeper
  if (session.status === 'unassigned' || session.role === 'unassigned') {
    return (
      <AccessPendingGatekeeper
        session={session}
        onRefresh={fetchSession}
        onSwitchDevEmail={switchDevEmail}
      />
    );
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        refreshSession: fetchSession,
        switchDevEmail,
        isSuperadmin: session.isSuperadmin,
        role: session.role,
        teamId: session.teamId,
        teamName: session.teamName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
