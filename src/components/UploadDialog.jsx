import { useEffect, useState, useRef } from "react";
import { toast } from "../utils/ToastHost";

// Icons
import { IoDocumentTextOutline, IoClose, IoCheckmarkCircle, IoWarning } from "react-icons/io5";
import { MdOutlineUploadFile } from "react-icons/md";

// File size limits (in bytes)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const WARNING_FILE_SIZE = 8 * 1024 * 1024; // 8MB - show warning above this

export default function UploadDialog({ open, onClose }) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [progress, setProgress] = useState({ phase: "", progress: 0, message: "", current: 0, total: 0 });
  const fileInputRef = useRef(null);
  const progressListenerId = useRef(null);

  /* Subscribe to upload progress */
  useEffect(() => {
    if (!open) return;

    progressListenerId.current = window.ipc.onUploadProgress((data) => {
      setProgress(data);
    });

    return () => {
      if (progressListenerId.current !== null) {
        window.ipc.offUploadProgress(progressListenerId.current);
        progressListenerId.current = null;
      }
    };
  }, [open]);

  /* ESC to close */
  useEffect(() => {
    if (!open) return;

    const onEsc = (e) => {
      if (e.key === "Escape" && !uploading) {
        document.activeElement?.blur();
        onClose();
      }
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose, uploading]);

  /* Reset state when dialog closes */
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setDragActive(false);
      setProgress({ phase: "", progress: 0, message: "", current: 0, total: 0 });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  /* Drag handlers */
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (uploading) return;

    const files = e.dataTransfer?.files;
    if (files && files[0]) {
      handleFileSelection(files[0]);
    }
  };

  /* File validation */
  const handleFileSelection = (file) => {
    // File size validation
    if (file.size > MAX_FILE_SIZE) {
      toast(`File size (${formatFileSize(file.size)}) exceeds 10MB limit`, "error");
      return;
    }

    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ];

    const validExtensions = [".csv", ".xls", ".xlsx"];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      toast("Please select a CSV or Excel file", "error");
      return;
    }

    // Show warning for large files
    if (file.size > WARNING_FILE_SIZE) {
      toast(`Large file (${formatFileSize(file.size)}) - upload may take longer`, "warning");
    }

    setSelectedFile(file);
  };

  /* File input change */
  const handleFileInput = (e) => {
    if (uploading) return;
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  /* Upload file */
  const handleUpload = async () => {
    if (!selectedFile || uploading) return;

    setUploading(true);
    setProgress({ phase: "reading", progress: 0, message: "Preparing upload...", current: 0, total: 0 });

    try {
      // Read file as buffer
      const arrayBuffer = await selectedFile.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Send to main process
      const result = await window.ipc.uploadFile({
        name: selectedFile.name,
        buffer: Array.from(buffer),
        type: selectedFile.type
      });

      if (result?.ok) {
        const msg = result.inserted > 0
          ? `Uploaded ${result.inserted} records successfully`
          : "File processed (no new records)";
        toast(msg, "success");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        // Small delay to show complete state
        setTimeout(() => {
          onClose();
          // Reload to refresh data
          setTimeout(() => {
            window.location.reload();
          }, 300);
        }, 800);
      } else {
        toast(result?.error || "Upload failed", "error");
        setUploading(false);
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast("Failed to upload file", "error");
      setUploading(false);
    }
  };

  /* Format file size */
  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  /* Get phase label */
  const getPhaseLabel = (phase) => {
    switch (phase) {
      case "reading": return "Reading File";
      case "parsing": return "Parsing Data";
      case "inserting": return "Inserting Records";
      case "complete": return "Complete";
      case "error": return "Error";
      default: return "Processing";
    }
  };

  /* Get phase color */
  const getPhaseColor = (phase) => {
    switch (phase) {
      case "complete": return "text-emerald-400";
      case "error": return "text-red-400";
      default: return "text-blue-400";
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-md flex items-center justify-center z-50"
      onClick={() => !uploading && onClose()}
    >
      <div
        className="w-125 bg-nero-900 border border-nero-700 rounded-2xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="text-lg font-semibold">Upload File</div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-nero-500 hover:text-nero-100 text-xl leading-none disabled:opacity-50 transition-colors cursor-pointer"
          >
            <IoClose className="w-5 h-5" />
          </button>
        </div>

        {/* Upload Area / Progress */}
        {!uploading ? (
          <div
            className={`relative border-2 rounded-xl transition-all duration-200 ${dragActive
              ? "border-emerald-500 bg-emerald-500/5"
              : "border-nero-700 bg-nero-800/50"
              }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileInput}
              disabled={uploading}
              className="hidden"
            />

            {!selectedFile ? (
              <div
                className="py-12 px-6 text-center cursor-pointer"
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <MdOutlineUploadFile className="text-3xl text-emerald-500" />
                  </div>
                </div>

                <div className="text-sm font-medium mb-1">
                  Drop your file here or click to browse
                </div>
                <div className="text-xs text-nero-500">
                  Supports CSV, XLS, and XLSX files
                </div>
              </div>
            ) : (
              <div className="py-8 px-6">
                <div className="flex items-center gap-4 p-4 bg-nero-800 rounded-lg border border-nero-700">
                  <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <IoDocumentTextOutline className="text-2xl text-emerald-500" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate mb-0.5">
                      {selectedFile.name}
                    </div>
                    <div className="text-xs text-nero-500">
                      {formatFileSize(selectedFile.size)}
                    </div>
                  </div>

                  {!uploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="w-8 h-8 rounded-lg bg-nero-700 hover:text-nero-100 flex items-center justify-center text-nero-400 hover:text-nero-200 transition-colors shrink-0 cursor-pointer"
                    >
                      <IoClose className="text-lg" />
                    </button>
                  )}
                </div>

                {!uploading && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full mt-3 py-2 text-xs text-nero-400 border-2 border-nero-800 rounded-md hover:text-nero-300 transition-colors cursor-pointer"
                  >
                    Choose a different file
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Progress UI */
          <div className="border-2 border-nero-700 bg-nero-800/50 rounded-xl p-6">
            {/* Phase indicator */}
            <div className="flex items-center gap-3 mb-4">
              {progress.phase === "complete" ? (
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <IoCheckmarkCircle className="text-2xl text-emerald-400" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                </div>
              )}
              <div>
                <div className={`text-sm font-medium ${getPhaseColor(progress.phase)}`}>
                  {getPhaseLabel(progress.phase)}
                </div>
                <div className="text-xs text-nero-500">
                  {progress.message}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="h-2 bg-nero-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ease-out ${progress.phase === "complete"
                    ? "bg-emerald-500"
                    : progress.phase === "error"
                      ? "bg-red-500"
                      : "bg-blue-500"
                    }`}
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>

            {/* Progress stats */}
            <div className="flex items-center justify-between text-xs text-nero-500">
              <span>{progress.progress}%</span>
              {progress.total > 0 && (
                <span>{progress.current} of {progress.total} records</span>
              )}
            </div>

            {/* Phase steps indicator */}
            <div className="flex items-center justify-center gap-2 mt-5 pt-4 border-t border-nero-700">
              {["reading", "parsing", "inserting", "complete"].map((phase, idx) => {
                const phases = ["reading", "parsing", "inserting", "complete"];
                const currentIdx = phases.indexOf(progress.phase);
                const isActive = idx === currentIdx;
                const isComplete = idx < currentIdx || progress.phase === "complete";

                return (
                  <div key={phase} className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${isComplete
                        ? "bg-emerald-500"
                        : isActive
                          ? "bg-blue-500 animate-pulse"
                          : "bg-nero-600"
                        }`}
                    />
                    {idx < 3 && (
                      <div className={`w-8 h-0.5 ${isComplete ? "bg-emerald-500/50" : "bg-nero-700"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-1.5 rounded-lg bg-nero-800 hover:bg-nero-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            {uploading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Uploading…
              </>
            ) : (
              "Upload"
            )}
          </button>
        </div>
      </div>
    </div >
  );
}