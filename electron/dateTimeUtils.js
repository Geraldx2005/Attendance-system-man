/**
 * Utility functions to handle different regional date/time formats
 * Supports both / and - for dates, and both : and . for times
 */

/**
 * Normalize date from regional format to YYYY-MM-DD
 * Handles: DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, YYYY-MM-DD
 */
export function normalizeDate(dateStr) {
  if (!dateStr) return null;

  // Replace / with - for consistent parsing
  const normalized = dateStr.replace(/\//g, "-");
  const parts = normalized.split("-");

  if (parts.length !== 3) return null;

  // Check if it's already in YYYY-MM-DD format
  if (parts[0].length === 4 && !isNaN(parts[1])) {
    return normalized; // Already in correct format like 2023-12-31
  }

  // Handle DD-MMM-YY or DD-MMM-YYYY or DD-MM-YYYY
  let [day, month, year] = parts;
  
  // Validate presence
  if (!day || !month || !year) return null;
  
  // Handle Year: if 2 digits, assume 20xx
  if (year.length === 2) {
    year = "20" + year;
  }
  
  // Handle Month: Convert Name to Number
  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };
  
  const lowerMonth = month.toLowerCase();
  if (monthMap[lowerMonth]) {
    month = monthMap[lowerMonth];
  } else {
      // Ensure numeric and padded
      month = month.padStart(2, "0");
  }

  // Ensure day is padded
  day = day.padStart(2, "0");
  
  // Final check for numeric values
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  
  return `${year}-${month}-${day}`;
}

/**
 * Normalize time from regional format to HH:MM
 * Handles: HH:MM, HH.MM
 */
export function normalizeTime(timeStr) {
  if (!timeStr) return null;

  // Normalize delimiters and trim whitespace
  const normalized = timeStr.toString().trim().replace(/\./g, ":");

  // Support HH:MM and HH:MM:SS
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] !== undefined ? Number(match[3]) : null;

  // Validate ranges
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  if (s !== null && (Number.isNaN(s) || s < 0 || s > 59)) return null;

  const hh = h.toString().padStart(2, "0");
  const mm = m.toString().padStart(2, "0");

  if (s === null) return `${hh}:${mm}`;

  const ss = s.toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Convert time to minutes (handles both formats)
 */
export function timeToMinutes(time) {
  const normalized = normalizeTime(time);
  if (!normalized) return null;

  const parts = normalized.split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  const s = parts[2] ?? 0;

  return h * 60 + m + s / 60;
}

/**
 * Convert 24-hour time to 12-hour format (handles both formats)
 */
export function to12Hour(time24) {
  const normalized = normalizeTime(time24);
  if (!normalized) return "";

  const parts = normalized.split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  const s = parts[2];
  
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;

  const seconds = Number.isFinite(s) ? `:${s.toString().padStart(2, "0")}` : "";
  return `${hour12}:${m.toString().padStart(2, "0")}${seconds} ${period}`;
}
