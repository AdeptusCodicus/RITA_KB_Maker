'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, UploadCloud, CheckSquare, FileCode2, Trash2 } from 'lucide-react';
import { getAllDrafts, deleteDraft, getActiveDraftId, setActiveDraftId } from '@/lib/drafts';
import type { KBDraft } from '@/types/kb';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [drafts, setDrafts] = useState<KBDraft[]>([]);
  const [activeDraftId, setActiveId] = useState<string | null>(null);

  const refreshDrafts = useCallback(() => {
    setDrafts(getAllDrafts());
    setActiveId(getActiveDraftId());
  }, []);

  useEffect(() => {
    refreshDrafts();
    window.addEventListener('kb_drafts_updated', refreshDrafts);
    window.addEventListener('storage', refreshDrafts);
    return () => {
      window.removeEventListener('kb_drafts_updated', refreshDrafts);
      window.removeEventListener('storage', refreshDrafts);
    };
  }, [refreshDrafts]);

  const handleSelectDraft = (draft: KBDraft) => {
    setActiveDraftId(draft.id);
    sessionStorage.setItem('kb_extracted_text', draft.extractedText);
    sessionStorage.setItem('kb_markdown', draft.markdown);
    sessionStorage.setItem('kb_filename', draft.filename);
    if (draft.qualityReport) {
      sessionStorage.setItem('kb_quality_report', JSON.stringify(draft.qualityReport));
    } else {
      sessionStorage.removeItem('kb_quality_report');
    }
    router.push('/review');
  };

  const handleDeleteDraft = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteDraft(id);
    if (activeDraftId === id) {
      router.push('/');
    }
  };

  const links = [
    { href: '/', label: 'Upload', icon: UploadCloud },
    { href: '/review', label: 'Review', icon: CheckSquare },
  ];

  return (
    <aside className="h-screen w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 flex-shrink-0">
      <div className="p-6 flex items-center space-x-3 border-b border-slate-800">
        <BookOpen className="w-8 h-8 text-blue-500 flex-shrink-0" />
        <h1 className="text-xl font-bold text-white tracking-tight">KB Maker</h1>
      </div>

      <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;

          return (
            <div key={link.href} className="space-y-1">
              <Link
                href={link.href}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                  ${
                    isActive
                      ? 'bg-blue-600/10 text-blue-400 font-medium'
                      : 'hover:bg-slate-800 hover:text-white'
                  }`}
              >
                <Icon className="w-5 h-5" />
                <span>{link.label}</span>
              </Link>

              {/* Sub-menu under Review for Drafts */}
              {link.href === '/review' && drafts.length > 0 && (
                <div className="pl-6 pr-1 py-1 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
                    Saved Drafts ({drafts.length})
                  </div>
                  {drafts.map((draft) => {
                    const isDraftActive = pathname === '/review' && activeDraftId === draft.id;
                    return (
                      <div
                        key={draft.id}
                        onClick={() => handleSelectDraft(draft)}
                        className={`group flex items-center justify-between px-3 py-2 text-xs rounded-md cursor-pointer transition-colors ${
                          isDraftActive
                            ? 'bg-blue-600/20 text-blue-300 font-medium'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <FileCode2 className="w-3.5 h-3.5 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
                          <span className="truncate">{draft.title || draft.filename || 'Untitled Draft'}</span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteDraft(e, draft.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 rounded transition-opacity"
                          title="Delete draft"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
        v1.0.0
      </div>
    </aside>
  );
}
