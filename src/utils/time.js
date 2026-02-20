import { to12Hour as convertTo12Hour } from '../../electron/dateTimeUtils.js';

// UI-friendly 12-hour format without showing seconds (even if present in data)
export function to12Hour(time24) {
  const base = convertTo12Hour(time24);
  if (!base) return "";
  // Strip trailing :ss before AM/PM if present
  return base.replace(/:\d{2}(?=\s[AP]M$)/, "");
}
