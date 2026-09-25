'use client';
import React, { useState, useEffect } from 'react';
import { GitBranch, AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (override: boolean) => void;
  title: string;
  qualityPassed: boolean;
  isLoading?: boolean;
}

export default function ConfirmPushModal({ isOpen, onClose, onConfirm, title, qualityPassed, isLoading }: ConfirmPushModalProps) {
  const [override, setOverride] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const slugify = (text: string) => {
    return text
      .toString()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  };

  const filename = slugify(title) || 'untitled-kb';
  const canPush = qualityPassed || override;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-200 flex items-center space-x-3">
          <GitBranch className="w-6 h-6 text-slate-700" />
          <h2 className="text-xl font-semibold text-slate-800">Push to GitHub</h2>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Repository:</span>
              <span className="font-medium text-slate-800">kb-repository</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Branch:</span>
              <span className="font-medium text-slate-800">main</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">File:</span>
              <span className="font-mono text-xs text-slate-800 mt-1">knowledge-base/{filename}.md</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Commit:</span>
              <span className="font-medium text-slate-800 truncate ml-4">Add KB: {title}</span>
            </div>
          </div>

          {!qualityPassed && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <p className="text-sm text-red-800 font-medium">Quality checks failed</p>
              </div>
              <label className="flex items-start space-x-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                  className="mt-1 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-red-700">I understand this KB did not pass quality checks. Push anyway.</span>
              </label>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3">
          <button 
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(override)}
            disabled={!canPush || isLoading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center space-x-2
              ${!canPush ? 'bg-slate-300 cursor-not-allowed' : 
                qualityPassed ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500' : 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'
              }`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Push to GitHub</span>
          </button>
        </div>
      </div>
    </div>
  );
}
