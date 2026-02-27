import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../utils/api";
import { toast } from "../utils/ToastHost";

export default function EmployeeMapDialog({
  open,
  employee,
  onClose,
  onSaved,
}) {
  const [name, setName] = useState("");
  const [inTime, setInTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  /* Load current values when dialog opens */
  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }

    if (employee) {
      setName(employee.name || employee.employeeId);
      setInTime(employee.inTime || "10:00");
    } else {
      setName("");
      setInTime("10:00");
    }
  }, [open, employee]);

  /* ESC to close */
  useEffect(() => {
    if (!open) return;

    const onEsc = (e) => {
      if (e.key === "Escape") {
        document.activeElement?.blur();
        onClose();
      }
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  /* Save */
  const save = async () => {
    if (!employee || !name.trim() || saving) return;

    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiFetch(`/api/employees/${employee.employeeId}`, {
        method: "POST",
        body: JSON.stringify({ name: trimmedName, inTime }),
      });

      toast("Employee updated successfully", "success");
      onSaved?.({ name: trimmedName, inTime });
      onClose();
    } catch (err) {
      console.error("Failed to update employee:", err);
      setError("Failed to update. Please try again.");
      toast("Failed to update employee", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/20 backdrop-blur-md flex items-center justify-center z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-96 bg-nero-900 border border-nero-700 rounded-2xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="text-lg font-semibold">Employee Mapping</div>
              <button
                onClick={onClose}
                className="text-nero-500 hover:text-nero-300 text-xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            {!employee ? (
              <div className="text-sm text-nero-500">
                Select an employee to map name
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                {/* Employee ID */}
                <div className="mb-3">
                  <div className="text-xs text-nero-500 mb-1">
                    Employee ID
                  </div>
                  <input
                    value={employee.employeeId}
                    disabled
                    className="w-full px-3 py-2 bg-nero-800 border border-nero-700 rounded-lg text-sm text-nero-400"
                  />
                </div>

                {/* Employee Name */}
                <div className="mb-3">
                  <div className="text-xs text-nero-500 mb-1">
                    Employee Name
                  </div>
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter employee name"
                    autoFocus
                    maxLength={50}
                    className="w-full px-3 py-2 bg-nero-800 border border-nero-700 rounded-lg text-sm text-nero-300 outline-none focus:border-nero-400"
                  />
                </div>

                {/* In Time */}
                <div className="mb-4">
                  <div className="text-xs text-nero-500 mb-1">
                    In Time
                  </div>
                  <input
                    type="time"
                    value={inTime}
                    onChange={(e) => setInTime(e.target.value)}
                    className="w-full px-3 py-2 bg-nero-800 border border-nero-700 rounded-lg text-sm text-nero-300 outline-none focus:border-nero-400 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
                  />
                  <div className="text-[11px] text-nero-500 mt-1">
                    Default: 10:00 AM
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="text-xs text-red-400 mb-3"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-lg text-sm text-nero-400 hover:text-nero-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="submit"
                    disabled={saving || !name.trim()}
                    className="px-4 py-1.5 rounded-lg bg-nero-700 hover:bg-nero-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {saving ? "Saving…" : "Save"}
                  </motion.button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}