import { useState, useEffect, useCallback } from "react";
import { Upload, AlertTriangle, Loader2, RefreshCw, FileText, Trash2 } from "lucide-react";

function formatFilename(text: string): string {
  let formatted = text;
  if (formatted.endsWith(".md")) {
    formatted = formatted.slice(0, -3);
  }
  formatted = formatted.replace(/[\s.]+/g, "_");
  formatted = formatted.replace(/[^a-zA-Z0-9_-]+/g, "");
  formatted = formatted.replace(/_+/g, "_");
  
  if (!formatted.startsWith("KB_")) {
    formatted = `KB_${formatted}`;
  }
  return `${formatted}.md`;
}

export default function DatabricksManagerModal({
  isOpen,
  onClose,
  onUpload,
  title,
  qualityPassed,
  isLoading,
  currentFilename
}: {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (override: boolean, customFilename: string) => void;
  title: string;
  qualityPassed: boolean;
  isLoading?: boolean;
  currentFilename?: string;
}) {
  const [overrideChecked, setOverrideChecked] = useState(false);
  const [files, setFiles] = useState<{path: string; file_size?: number}[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [customFilename, setCustomFilename] = useState("");

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch("/api/databricks");
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error("Failed to fetch files", err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
      setCustomFilename(formatFilename(title));
    }
  }, [isOpen, title, fetchFiles]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  const handleDelete = async (path: string) => {
    if (!confirm(`Are you sure you want to delete ${path.split("/").pop()}?`)) return;
    try {
      const res = await fetch("/api/databricks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
      });
      if (res.ok) {
        fetchFiles();
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop"
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6 flex flex-col max-h-[90vh]"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Upload
            className="w-5 h-5"
            style={{ color: "var(--color-accent)" }}
          />
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Databricks File Manager
          </h3>
        </div>

        <div className="flex-1 overflow-auto flex flex-col gap-6 custom-scrollbar pr-2">
          {/* Upload Section */}
          <div className="space-y-3 rounded-lg p-4 text-sm" style={{ background: "var(--color-surface-tertiary)" }}>
            <h4 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Current Draft Upload</h4>
            
            <div className="flex justify-between items-center">
              <span style={{ color: "var(--color-text-muted)" }}>Target Filename</span>
              <input 
                type="text" 
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                className="font-mono text-xs px-2 py-1 border rounded w-1/2"
                style={{ background: "var(--color-surface)", color: "var(--color-text-primary)", borderColor: "var(--color-border)" }}
              />
            </div>

            {!qualityPassed && (
              <div
                className="mt-4 rounded-lg p-3 flex items-start gap-2"
                style={{
                  background: "#fef3c7",
                  border: "1px solid #f59e0b",
                }}
              >
                <AlertTriangle
                  className="w-4 h-4 flex-shrink-0 mt-0.5"
                  style={{ color: "var(--color-warning)" }}
                />
                <div>
                  <p className="text-sm font-medium" style={{ color: "#92400e" }}>
                    Quality check not passed
                  </p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideChecked}
                      onChange={(e) => setOverrideChecked(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs" style={{ color: "#92400e" }}>
                      I understand this KB did not pass quality checks. Upload anyway.
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => onUpload(!qualityPassed && overrideChecked, customFilename)}
                disabled={isLoading || (!qualityPassed && !overrideChecked)}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: !qualityPassed ? "var(--color-warning)" : "var(--color-accent)",
                }}
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload / Overwrite</>
                )}
              </button>
            </div>
          </div>

          {/* Directory Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Databricks Directory</h4>
              <button 
                onClick={fetchFiles} 
                disabled={loadingFiles}
                className="p-1 rounded hover:bg-slate-100"
              >
                <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} style={{ color: "var(--color-text-muted)" }} />
              </button>
            </div>
            
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              {loadingFiles && files.length === 0 ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
              ) : files.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No files found in Databricks directory.</div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                  {files.map((file) => (
                    <li key={file.path} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium truncate max-w-[200px] sm:max-w-[300px]" style={{ color: "var(--color-text-primary)" }}>
                          {file.path.split("/").pop()}
                        </span>
                        {file.file_size && (
                          <span className="text-xs text-gray-400">{(file.file_size / 1024).toFixed(1)} KB</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleDelete(file.path)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          title="Delete File"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 mt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
