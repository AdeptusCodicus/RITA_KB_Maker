"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RotateCcw, ArrowLeft, Database } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function LiveKBError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("LiveKB error caught by route boundary:", error);
  }, [error]);

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-800 overflow-hidden font-sans">
      {/* Primary Sidebar */}
      <Sidebar />

      {/* Main Recovery Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white">
        <header className="h-14 border-b border-slate-200 px-6 flex items-center justify-between bg-white flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shadow-2xs">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900 tracking-tight leading-none">
                Current Knowledge Base
              </h1>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Databricks Explorer Recovery
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-8 bg-[#f8fafc]">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center mx-auto shadow-2xs">
              <AlertCircle className="w-6 h-6 stroke-[1.75]" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Unable to Load Knowledge Base Explorer
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                An unexpected error occurred while communicating with the Databricks volume. The rest of the workbench remains active.
              </p>
            </div>

            {error?.message && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left font-mono text-[11px] text-slate-600 break-words max-h-32 overflow-y-auto custom-scrollbar">
                {error.message}
              </div>
            )}

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Loading</span>
              </button>

              <button
                onClick={() => router.push("/")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Home</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
