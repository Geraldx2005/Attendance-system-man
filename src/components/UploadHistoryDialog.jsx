import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "../utils/ToastHost";

// Icons
import { IoClose, IoTrashOutline, IoTimeOutline, IoDocumentTextOutline, IoWarning } from "react-icons/io5";

export default function UploadHistoryDialog({ open, onClose }) {
    const [uploads, setUploads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);

    /* Fetch upload history */
    useEffect(() => {
        if (!open) return;

        const fetchHistory = async () => {
            setLoading(true);
            try {
                const data = await window.api.getUploadHistory();
                setUploads(data || []);
            } catch (err) {
                console.error("Failed to fetch upload history:", err);
                toast("Failed to load upload history", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [open]);

    /* ESC to close */
    useEffect(() => {
        if (!open) return;

        const onEsc = (e) => {
            if (e.key === "Escape" && !deleting) {
                setConfirmDelete(null);
                onClose();
            }
        };

        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose, deleting]);

    /* Reset state when dialog closes */
    useEffect(() => {
        if (!open) {
            setConfirmDelete(null);
        }
    }, [open]);

    /* Handle delete */
    const handleDelete = async (uploadId) => {
        setDeleting(uploadId);
        try {
            const result = await window.api.deleteUpload(uploadId);
            if (result?.ok) {
                toast(`Deleted ${result.logsDeleted} attendance records`, "success");
                // Animate out locally
                setUploads(prev => prev.filter(u => u.id !== uploadId));
                setConfirmDelete(null);
            } else {
                toast("Failed to delete upload", "error");
            }
        } catch (err) {
            console.error("Delete error:", err);
            toast("Failed to delete upload", "error");
        } finally {
            setDeleting(null);
        }
    };

    /* Format date */
    const formatDate = (dateStr) => {
        if (!dateStr) return "Unknown";
        const d = new Date(dateStr);
        return d.toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
                    onClick={() => !deleting && onClose()}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{
                            layout: { duration: 0.2, type: "spring", bounce: 0 },
                            opacity: { duration: 0.2 }
                        }}
                        className="w-[550px] max-h-[80vh] bg-nero-900 border border-nero-700 rounded-2xl shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-nero-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                    <IoTimeOutline className="text-xl text-emerald-400" />
                                </div>
                                <div>
                                    <div className="text-lg font-semibold">Upload History</div>
                                    <div className="text-xs text-nero-500">
                                        {uploads.length} upload{uploads.length !== 1 ? "s" : ""} recorded
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                disabled={deleting}
                                className="text-nero-500 hover:text-nero-100 text-xl leading-none disabled:opacity-50 transition-colors cursor-pointer"
                            >
                                <IoClose className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto p-4 minimal-scrollbar">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-nero-450">
                                    <div className="w-8 h-8 border-4 border-nero-600 border-t-blue-500 rounded-full animate-spin mb-3" />
                                    <div className="text-sm">Loading history...</div>
                                </div>
                            ) : uploads.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-nero-450">
                                    <IoDocumentTextOutline className="text-5xl mb-3 opacity-50" />
                                    <div className="text-sm">No uploads recorded yet</div>
                                    <div className="text-xs text-nero-500 mt-1">
                                        Upload files using the + button in the sidebar
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <AnimatePresence mode="popLayout" initial={false}>
                                        {uploads.map((upload) => (
                                            <motion.div
                                                layout
                                                key={upload.id}
                                                initial={{ opacity: 0, filter: "blur(4px)" }}
                                                animate={{ opacity: 1, filter: "blur(0px)" }}
                                                exit={{ opacity: 0, scale: 0.92, filter: "blur(4px)" }}
                                                transition={{
                                                    duration: 0.35,
                                                    ease: "easeInOut"
                                                }}
                                                className="bg-nero-900 border border-nero-700 rounded-lg p-4 hover:border-nero-600 transition-colors"
                                            >
                                                <AnimatePresence mode="popLayout" initial={false}>
                                                    {confirmDelete === upload.id ? (
                                                        <motion.div
                                                            key="delete-confirm"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            exit={{ opacity: 0 }}
                                                            transition={{ duration: 0.2, ease: "easeInOut" }}
                                                            className="flex items-center gap-3"
                                                        >
                                                            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                                                                <IoWarning className="text-xl text-red-400" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="text-sm font-medium text-red-400">Delete this upload?</div>
                                                                <div className="text-xs text-nero-500">
                                                                    This will remove {upload.recordsInserted} attendance records
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => setConfirmDelete(null)}
                                                                    disabled={deleting}
                                                                    className="px-3 py-1.5 text-xs rounded-md bg-nero-700 hover:bg-nero-600 disabled:opacity-50 transition-colors cursor-pointer"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(upload.id)}
                                                                    disabled={deleting}
                                                                    className="px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                                                                >
                                                                    {deleting === upload.id ? (
                                                                        <>
                                                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                            Deleting...
                                                                        </>
                                                                    ) : (
                                                                        "Delete"
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </motion.div>
                                                    ) : (
                                                        /* Normal View */
                                                        <motion.div
                                                            key="normal-view"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            exit={{ opacity: 0 }}
                                                            transition={{ duration: 0.2, ease: "easeInOut" }}
                                                            className="flex items-center gap-3"
                                                        >
                                                            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                                <IoDocumentTextOutline className="text-xl text-emerald-400" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-medium truncate">{upload.filename}</div>
                                                                <div className="text-xs text-nero-500 flex items-center gap-2 mt-0.5">
                                                                    <span>{formatDate(upload.uploadedAt)}</span>
                                                                    <span className="text-nero-600">•</span>
                                                                    <span className="text-emerald-400">{upload.recordsInserted} inserted</span>
                                                                    {upload.recordsSkipped > 0 && (
                                                                        <>
                                                                            <span className="text-nero-600">•</span>
                                                                            <span className="text-amber-400">{upload.recordsSkipped} skipped</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => setConfirmDelete(upload.id)}
                                                                className="w-8 h-8 rounded-lg bg-nero-700 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center text-nero-400 transition-colors cursor-pointer"
                                                                title="Delete upload"
                                                            >
                                                                <IoTrashOutline className="text-lg" />
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-nero-700">
                            <div className="text-xs text-nero-500 text-center">
                                Deleting an upload will remove all associated attendance records
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
