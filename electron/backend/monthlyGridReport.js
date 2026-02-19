import { getDB } from "./db.js";
import logger from "../utils/logger.js";

/**
 * Convert HH:MM:SS to minutes since midnight
 */
function timeToMinutes(time) {
  if (!time) return null;
  const parts = time.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return h * 60 + m;
}

/**
 * Determine day status + details from punches string for a given date.
 * Returns { status, firstIn, lastOut, workedMinutes }
 */
function getDayDetails(punches, dateStr) {
  const dateObj = new Date(dateStr);
  const isSunday = dateObj.getDay() === 0;

  if (!punches || !punches.trim()) {
    return { status: isSunday ? "WO" : "A", firstIn: null, lastOut: null, workedMinutes: 0 };
  }

  const times = punches
    .split(", ")
    .map((t) => t.trim())
    .sort();
  if (times.length === 0) {
    return { status: isSunday ? "WO" : "A", firstIn: null, lastOut: null, workedMinutes: 0 };
  }

  const firstIn = times[0];
  const lastOut = times[times.length - 1];

  const inMins = timeToMinutes(firstIn);
  const outMins = timeToMinutes(lastOut);

  if (inMins !== null && outMins !== null && outMins > inMins) {
    const workedMins = outMins - inMins;
    let status;

    if (isSunday) {
      status = workedMins >= 5 * 60 ? "WW" : "WO";
    } else if (workedMins >= 8 * 60) {
      status = "P";
    } else if (workedMins >= 5 * 60) {
      status = "HD";
    } else {
      status = "A";
    }

    return { status, firstIn, lastOut, workedMinutes: workedMins };
  }

  // Bad data or single punch
  return { status: isSunday ? "WO" : "A", firstIn, lastOut, workedMinutes: 0 };
}

/**
 * Generate monthly grid report: each employee gets a daily status map.
 *
 * @param {string} month - Format: "YYYY-MM"
 * @returns {{ employees: Array, daysInMonth: number, monthKey: string }}
 */
export function generateMonthlyGridReport(month) {
  const db = getDB();
  const from = `${month}-01`;
  const to = `${month}-31`;

  logger.info("Generating monthly grid report", { month });

  // 1. Get all employees
  const employees = db.prepare("SELECT id, name FROM employees ORDER BY name").all();

  // 2. Get all logs for the month
  const logs = db
    .prepare(
      `
    SELECT employee_id, date, punches
    FROM daily_attendance
    WHERE date BETWEEN ? AND ?
  `,
    )
    .all(from, to);

  // 3. Create lookup: employeeId -> date -> punches
  const logMap = new Map();
  for (const log of logs) {
    if (!logMap.has(log.employee_id)) {
      logMap.set(log.employee_id, new Map());
    }
    logMap.get(log.employee_id).set(log.date, log.punches);
  }

  // 4. Determine day range
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [targetYear, targetMonth] = month.split("-").map(Number);

  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  let limitDay = daysInMonth;

  if (targetYear === currentYear && targetMonth === currentMonth) {
    limitDay = now.getDate();
  } else if (targetYear > currentYear || (targetYear === currentYear && targetMonth > currentMonth)) {
    limitDay = 0;
  }

  // 5. Build result
  const result = [];

  for (const emp of employees) {
    const empLogs = logMap.get(emp.id) || new Map();
    const dailyStatus = {};

    for (let day = 1; day <= limitDay; day++) {
      const dateStr = `${month}-${String(day).padStart(2, "0")}`;
      const punches = empLogs.get(dateStr) || null;
      dailyStatus[dateStr] = getDayDetails(punches, dateStr);
    }

    result.push({
      employeeId: emp.id,
      employeeName: emp.name,
      dailyStatus,
    });
  }

  logger.info("Monthly grid report generated", { month, employeeCount: result.length });

  return {
    employees: result,
    daysInMonth: limitDay,
    monthKey: month,
  };
}
