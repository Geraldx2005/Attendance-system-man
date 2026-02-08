import { getDB } from "./db.js";
import logger from "../utils/logger.js";

/**
 * Generate monthly attendance report using a single optimized query.
 * Replaces N+1 query pattern with batch aggregation.
 * 
 * @param {string} month - Format: "YYYY-MM"
 * @returns {Array<{employeeId, employeeName, present, halfDay, absent, totalPresent}>}
 */
export function generateMonthlyReport(month) {
  const db = getDB();
  const from = `${month}-01`;
  const to = `${month}-31`;

  logger.info("Generating monthly report", { month });

  // Single query: fetch all punches for the month, grouped by employee and date
  const rows = db.prepare(`
    SELECT 
      e.id AS employee_id,
      e.name AS employee_name,
      al.date,
      MIN(al.time) AS first_in,
      MAX(al.time) AS last_out
    FROM employees e
    LEFT JOIN attendance_logs al 
      ON e.id = al.employee_id 
      AND al.date BETWEEN ? AND ?
    GROUP BY e.id, al.date
    ORDER BY e.id, al.date
  `).all(from, to);

  // Aggregate by employee
  const employeeMap = new Map();

  for (const row of rows) {
    if (!employeeMap.has(row.employee_id)) {
      employeeMap.set(row.employee_id, {
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        present: 0,
        halfDay: 0,
        absent: 0,
      });
    }

    const emp = employeeMap.get(row.employee_id);

    // Skip if no date (employee exists but no logs for this month)
    if (!row.date) continue;

    // Calculate worked minutes
    const inMins = timeToMinutes(row.first_in);
    const outMins = timeToMinutes(row.last_out);

    if (inMins !== null && outMins !== null && outMins > inMins) {
      const workedMins = outMins - inMins;

      if (workedMins >= 8 * 60) {
        emp.present++;
      } else if (workedMins >= 5 * 60) {
        emp.halfDay++;
      } else {
        emp.absent++;
      }
    } else {
      emp.absent++;
    }
  }

  // Convert to array and calculate totalPresent
  const result = Array.from(employeeMap.values()).map(emp => ({
    ...emp,
    totalPresent: emp.present + emp.halfDay * 0.5,
  }));

  logger.info("Monthly report generated", { month, employeeCount: result.length });

  return result;
}

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
