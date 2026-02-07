import { useEffect, useState } from "react";

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-md flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
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

          <button
            onClick={toggleTheme}
            className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${theme === "dark" ? "bg-emerald-600" : "bg-nero-700"
              }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-6" : "translate-x-0"
                }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}