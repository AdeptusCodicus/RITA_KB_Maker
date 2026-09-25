'use client';
import React from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ProcessingState } from '../types/kb';

interface ProgressStreamProps {
  state: ProcessingState;
}

export default function ProgressStream({ state }: ProgressStreamProps) {
  const getIcon = () => {
    if (state.step === 'complete') return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (state.step === 'error') return <AlertCircle className="w-5 h-5 text-red-500" />;
    if (state.step === 'idle') return null;
    return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
  };

  if (state.step === 'idle') return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center space-x-3 mb-4">
        {getIcon()}
        <span className="font-medium text-slate-800 capitalize">
          {state.step.replace('-', ' ')}
        </span>
      </div>
      
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div 
          className={`h-2.5 rounded-full transition-all duration-500 ease-out ${state.step === 'error' ? 'bg-red-500' : state.step === 'complete' ? 'bg-green-500' : 'bg-blue-600'}`}
          style={{ width: `${state.progress}%` }}
        ></div>
      </div>
      
      <p className="mt-3 text-sm text-slate-600 text-center animate-pulse">
        {state.message}
      </p>
    </div>
  );
}
