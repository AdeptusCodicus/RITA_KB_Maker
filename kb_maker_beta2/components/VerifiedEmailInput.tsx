'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UserCheck,
} from 'lucide-react';
import type { SearchUserItem } from '@/types/auth';

interface VerifiedEmailInputProps {
  value: string;
  onChange: (email: string, isValid: boolean, user?: SearchUserItem | null) => void;
  placeholder?: string;
  currentTeamId?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}

const ORG_DOMAIN = 'foodgroup.ph';

export default function VerifiedEmailInput({
  value,
  onChange,
  placeholder = 'colleague@foodgroup.ph',
  currentTeamId,
  label,
  helperText,
  required = false,
  autoFocus = false,
  disabled = false,
}: VerifiedEmailInputProps) {
  const [emailInput, setEmailInput] = useState(value || '');
  const [isValidating, setIsValidating] = useState(false);
  const [matchedUser, setMatchedUser] = useState<SearchUserItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<
    | 'empty'
    | 'incomplete'
    | 'invalid_domain'
    | 'already_in_team'
    | 'google_verified_existing'
    | 'google_verified_new'
    | 'google_not_found'
  >('empty');

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeRequestIdRef = useRef<number>(0);

  // Sync external value
  useEffect(() => {
    setEmailInput(value || '');
  }, [value]);

  const validateEmail = useCallback(
    async (email: string) => {
      const currentRequestId = ++activeRequestIdRef.current;
      const trimmed = email.trim().toLowerCase();
      setErrorMessage(null);

      if (!trimmed) {
        if (currentRequestId === activeRequestIdRef.current) {
          setValidationState('empty');
          setMatchedUser(null);
          onChange('', false, null);
        }
        return;
      }

      // Check email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        if (currentRequestId === activeRequestIdRef.current) {
          setValidationState('incomplete');
          setMatchedUser(null);
          onChange(trimmed, false, null);
        }
        return;
      }

      // Check organization domain
      const domain = trimmed.split('@').pop() || '';
      if (domain !== ORG_DOMAIN) {
        if (currentRequestId === activeRequestIdRef.current) {
          setValidationState('invalid_domain');
          setMatchedUser(null);
          onChange(trimmed, false, null);
        }
        return;
      }

      // Valid org domain: verify in real time against Google Workspace via DWD
      setIsValidating(true);
      try {
        const res = await fetch(`/api/users/search?email=${encodeURIComponent(trimmed)}&_t=${Date.now()}`);
        if (currentRequestId !== activeRequestIdRef.current) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setMatchedUser(null);
          setErrorMessage(errData.error || 'Failed to verify account with Google Workspace');
          setValidationState('google_not_found');
          onChange(trimmed, false, null);
          return;
        }

        const data = await res.json();
        if (currentRequestId !== activeRequestIdRef.current) return;

        // 1. Google Workspace confirmed non-existent
        if (!data.existsOnGoogle) {
          setMatchedUser(null);
          setErrorMessage(data.error || `User does not exist in Google Workspace (@${ORG_DOMAIN})`);
          setValidationState('google_not_found');
          onChange(trimmed, false, null);
          return;
        }

        // 2. Google Workspace confirmed user EXISTS!
        const user: SearchUserItem | null = data.user;
        setMatchedUser(user);

        // Check if user is already assigned to the current team
        if (currentTeamId && user?.teamId === currentTeamId) {
          setValidationState('already_in_team');
          onChange(trimmed, false, user);
          return;
        }

        if (data.isExistingMember && user?.teamId) {
          // Already registered in another team or system
          setValidationState('google_verified_existing');
          onChange(trimmed, true, user);
        } else {
          // Real Google account verified, ready to invite or assign
          setValidationState('google_verified_new');
          onChange(trimmed, true, user);
        }
      } catch (err: any) {
        if (currentRequestId !== activeRequestIdRef.current) return;
        console.error('Email verification error:', err);
        setMatchedUser(null);
        setErrorMessage('Network error while contacting Google Workspace verification');
        setValidationState('google_not_found');
        onChange(trimmed, false, null);
      } finally {
        if (currentRequestId === activeRequestIdRef.current) {
          setIsValidating(false);
        }
      }
    },
    [currentTeamId, onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmailInput(val);

    const trimmed = val.trim().toLowerCase();
    // Invalidate previous in-flight requests immediately
    activeRequestIdRef.current++;

    if (!trimmed) {
      setValidationState('empty');
      setMatchedUser(null);
      setErrorMessage(null);
      onChange('', false, null);
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        setValidationState('incomplete');
        setMatchedUser(null);
        setErrorMessage(null);
        onChange(trimmed, false, null);
      } else {
        const domain = trimmed.split('@').pop() || '';
        if (domain !== ORG_DOMAIN) {
          setValidationState('invalid_domain');
          setMatchedUser(null);
          setErrorMessage(null);
          onChange(trimmed, false, null);
        } else {
          // Reset to incomplete while validating debounce fires
          setValidationState('incomplete');
          setMatchedUser(null);
          setErrorMessage(null);
        }
      }
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      validateEmail(val);
    }, 250);
  };

  const isVerified =
    validationState === 'google_verified_existing' ||
    validationState === 'google_verified_new';

  return (
    <div className="w-full text-left space-y-1.5">
      {label && (
        <label className="block text-xs font-semibold text-slate-300">
          {label}
        </label>
      )}

      {/* Input Field with Inline Indicator Beacon */}
      <div className="relative flex items-center">
        <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />

        <input
          type="email"
          value={emailInput}
          onChange={handleInputChange}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className={`w-full bg-[#090d16] border rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-600 outline-none transition-all ${
            isVerified
              ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30'
              : validationState === 'invalid_domain' ||
                validationState === 'already_in_team' ||
                validationState === 'google_not_found'
              ? 'border-amber-500/50 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30'
              : 'border-[#1a2234] focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20'
          }`}
        />

        {/* Right indicator: Spinner or Green Light / Warning Beacon */}
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          {isValidating ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : isVerified ? (
            <div className="flex items-center gap-1.5" title="Google Workspace Account Verified">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 shadow-sm shadow-emerald-500/50 animate-pulse" />
            </div>
          ) : validationState === 'invalid_domain' ||
            validationState === 'already_in_team' ||
            validationState === 'google_not_found' ? (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          ) : null}
        </div>
      </div>

      {/* Live Validation Feedback Pill */}
      {validationState !== 'empty' && (
        <div className="pt-0.5 animate-in fade-in duration-150">
          {isValidating ? (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
              <span>Verifying with Google Workspace...</span>
            </div>
          ) : isVerified && matchedUser ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>
                Google Account Verified:{' '}
                <strong className="text-white font-semibold">
                  {matchedUser.name || matchedUser.email}
                </strong>
              </span>
              {matchedUser.teamName && (
                <span className="text-[10px] text-emerald-500 font-normal">
                  (Assigned to {matchedUser.teamName})
                </span>
              )}
            </div>
          ) : validationState === 'google_not_found' ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>
                {errorMessage || `User does not exist in Google Workspace (@${ORG_DOMAIN})`}
              </span>
            </div>
          ) : validationState === 'already_in_team' ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>This colleague is already a member of this team</span>
            </div>
          ) : validationState === 'invalid_domain' ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>Must use your organization domain (@{ORG_DOMAIN})</span>
            </div>
          ) : validationState === 'incomplete' && emailInput.includes('@') ? (
            <div className="text-[11px] text-slate-500">
              Complete typing colleague&apos;s email (@{ORG_DOMAIN})
            </div>
          ) : null}
        </div>
      )}

      {helperText && validationState === 'empty' && (
        <p className="text-[10px] text-slate-500">{helperText}</p>
      )}
    </div>
  );
}
