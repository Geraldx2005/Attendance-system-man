import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function SettingsDialog({ open, onClose, theme, toggleTheme }) {
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
            transition={{
              layout: { duration: 0.2, type: "spring", bounce: 0 },
              opacity: { duration: 0.2 }
            }}
            className="w-96 bg-nero-900 border border-nero-700 rounded-2xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="text-lg font-semibold">Settings</div>
              <button
                onClick={onClose}
                className="text-nero-500 hover:text-nero-300 text-xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-nero-500">
                  Application appearance
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={toggleTheme}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${theme === "dark" ? "bg-emerald-600" : "bg-nero-700"
                  }`}
              >
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white ${theme === "dark" ? "translate-x-6" : "translate-x-0"
                    }`}
                />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}