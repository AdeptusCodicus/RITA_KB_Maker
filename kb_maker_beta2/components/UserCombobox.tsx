'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  User,
  Check,
  X,
  Loader2,
  Mail,
  Shield,
  ShieldCheck,
  Building2,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import type { SearchUserItem } from '@/types/auth';

interface UserComboboxProps {
  value: string;
  onChange: (email: string, user?: SearchUserItem | null) => void;
  placeholder?: string;
  currentTeamId?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export default function UserCombobox({
  value,
  onChange,
  placeholder = 'Search colleague by name or Google email...',
  currentTeamId,
  label,
  helperText,
  required,
  autoFocus,
}: UserComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(value || '');
  const [users, setUsers] = useState<SearchUserItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync internal search input with external value prop
  useEffect(() => {
    setSearchQuery(value || '');
  }, [value]);

  // Fetch users from API
  const fetchUsers = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const q = encodeURIComponent(query.trim());
      const res = await fetch(`/api/users/search?q=${q}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.warn('Failed to search users:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on focus / search query change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setIsOpen(true);
    setHighlightedIndex(-1);

    // Call onChange with current raw text
    onChange(val, null);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchUsers(val);
    }, 200);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    fetchUsers(searchQuery);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selection handler
  const handleSelectUser = (user: SearchUserItem) => {
    if (currentTeamId && user.teamId === currentTeamId) return; // already in this team
    setSearchQuery(user.email);
    onChange(user.email, user);
    setIsOpen(false);
  };

  const handleSelectRawEmail = () => {
    if (!searchQuery.trim()) return;
    onChange(searchQuery.trim(), null);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchQuery('');
    onChange('', null);
    inputRef.current?.focus();
    fetchUsers('');
  };

  // Check if current search matches an email exactly
  const hasExactEmailMatch = users.some(
    (u) => u.email.toLowerCase() === searchQuery.trim().toLowerCase()
  );

  const isEmailLike = searchQuery.includes('@') && searchQuery.includes('.');

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        fetchUsers(searchQuery);
      }
      return;
    }

    const totalItems = users.length + (!hasExactEmailMatch && searchQuery.trim() ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < totalItems ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < users.length) {
        handleSelectUser(users[highlightedIndex]);
      } else if (highlightedIndex === users.length && !hasExactEmailMatch) {
        handleSelectRawEmail();
      } else if (users.length === 1 && !currentTeamId || (users[0] && users[0].teamId !== currentTeamId)) {
        handleSelectUser(users[0]);
      } else if (isEmailLike) {
        handleSelectRawEmail();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full text-left">
      {label && (
        <label className="block text-xs font-medium text-slate-300 mb-1.5">
          {label}
        </label>
      )}

      {/* Input Box */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          required={required}
          autoFocus={autoFocus}
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full bg-[#090d16] border border-[#1a2234] rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-blue-500/60 transition-colors"
        />

        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            title="Clear"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {helperText && (
        <p className="text-[10px] text-slate-500 mt-1">{helperText}</p>
      )}

      {/* Dropdown Results Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-60 bg-[#0c1220] border border-[#1a2234] rounded-xl shadow-2xl overflow-hidden max-h-64 flex flex-col animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 border-b border-[#1a2234] bg-[#080c16] flex items-center justify-between text-[10px] text-slate-500 uppercase font-semibold tracking-wider">
            <span>Organization Directory Matches</span>
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-[#1a2234]/50 custom-scrollbar">
            {isLoading && users.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                <span>Searching organization directory...</span>
              </div>
            ) : users.length === 0 && !searchQuery.trim() ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Start typing letters or a colleague's name to see matches.
              </div>
            ) : (
              <>
                {users.map((user, idx) => {
                  const isCurrentTeam = Boolean(currentTeamId && user.teamId === currentTeamId);
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={user.email}
                      onClick={() => !isCurrentTeam && handleSelectUser(user)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                        isCurrentTeam
                          ? 'opacity-50 cursor-not-allowed bg-[#090d16]'
                          : isHighlighted
                          ? 'bg-blue-950/40 text-white cursor-pointer'
                          : 'hover:bg-[#131b2e] cursor-pointer text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-semibold text-slate-300 flex-shrink-0">
                          {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-100 truncate flex items-center gap-1.5">
                            <span>{user.name}</span>
                            {user.isSuperadmin && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                                Superadmin
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400 truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>

                      {/* Status Pill */}
                      <div className="flex-shrink-0 text-right">
                        {isCurrentTeam ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-400" />
                            Already in this team
                          </span>
                        ) : user.teamId ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-700/50 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-indigo-400" />
                            In {user.teamName || 'other team'}
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Available
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Option to invite new email if not in directory list */}
                {searchQuery.trim() && !hasExactEmailMatch && (
                  <div
                    onClick={handleSelectRawEmail}
                    onMouseEnter={() => setHighlightedIndex(users.length)}
                    className={`px-3.5 py-2.5 flex items-center gap-2.5 text-xs border-t border-[#1a2234] transition-colors cursor-pointer ${
                      highlightedIndex === users.length
                        ? 'bg-blue-950/50 text-blue-200'
                        : 'text-slate-300 hover:bg-[#131b2e]'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-blue-300 font-medium truncate">
                        Invite new: <span className="font-mono text-white">{searchQuery.trim()}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Add colleague not yet in directory (email verification will run upon save)
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
