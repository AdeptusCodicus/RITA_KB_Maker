'use client';
import React from 'react';

interface KBEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function KBEditor({ value, onChange, readOnly = false }: KBEditorProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !readOnly) {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="w-full h-full min-h-[400px] flex flex-col border border-slate-300 rounded-lg overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      <div className="bg-slate-50 border-b border-slate-300 px-4 py-2 flex justify-between items-center text-sm text-slate-600 font-medium">
        <span>Markdown Editor</span>
        <span className="text-xs text-slate-400">JetBrains Mono</span>
      </div>
      <textarea
        className="flex-1 w-full p-4 font-mono text-sm text-slate-800 bg-white resize-none outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        placeholder="Knowledge base markdown content..."
      />
    </div>
  );
}
