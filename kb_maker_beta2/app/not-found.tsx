import Link from "next/link";
import { FileQuestion, ArrowLeft, Database } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function NotFound() {
  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-800 overflow-hidden font-sans">
      {/* Primary Sidebar */}
      <Sidebar />

      {/* Main 404 Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white">
        <main className="flex-1 flex items-center justify-center p-8 bg-[#f8fafc]">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
              <FileQuestion className="w-6 h-6 stroke-[1.75]" />
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold border border-slate-200">
                404 Error
              </span>
              <h2 className="text-base font-semibold text-slate-900 mt-2">
                Page or Document Not Found
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                The requested URL does not match any route in the application. You can return to the knowledge base generator or explore live files.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Home</span>
              </Link>

              <Link
                href="/kb"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Current Knowledge Base</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
