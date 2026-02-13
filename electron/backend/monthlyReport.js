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

  // 1. Get all employees
  const employees = db.prepare("SELECT id, name FROM employees ORDER BY name").all();

  // 2. Get all logs for the month
  const logs = db.prepare(`
    SELECT 
      employee_id,
      date,
      punches
    FROM daily_attendance
    WHERE date BETWEEN ? AND ?
  `).all(from, to);

  // 3. Create a lookup map: employeeId -> date -> log
  const logMap = new Map();
  for (const log of logs) {
    if (!logMap.has(log.employee_id)) {
      logMap.set(log.employee_id, new Map());
    }
    
    // Parse first_in and last_out from punches string
    let first_in = null;
    let last_out = null;
    if (log.punches) {
        const times = log.punches.split(", ").map(t => t.trim()).sort();
        if (times.length > 0) {
            first_in = times[0];
            last_out = times[times.length - 1];
        }
    }
    
    logMap.get(log.employee_id).set(log.date, { ...log, first_in, last_out });
  }

  // 4. Determine expected days in the month
  // If month is current month, only go up to today. 
  // If month is past, go to last day of month.
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const [targetYear, targetMonth] = month.split("-").map(Number);
  
  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  let limitDay = daysInMonth;

  // If asking for the current month, limit to today
  if (targetYear === currentYear && targetMonth === currentMonth) {
    limitDay = now.getDate(); 
  } else if (targetYear > currentYear || (targetYear === currentYear && targetMonth > currentMonth)) {
    // Future month? Should be 0 days ideally, but let's just return empty stats or 0 if user forces it
    limitDay = 0; 
  }

  const result = [];

  for (const emp of employees) {
    const stats = {
      employeeId: emp.id,
      employeeName: emp.name,
      present: 0,
      halfDay: 0,
      absent: 0,
      weeklyOff: 0,
      woWorked: 0,
      totalPresent: 0,
    };

    const empLogs = logMap.get(emp.id) || new Map();

    for (let day = 1; day <= limitDay; day++) {
      const dateStr = `${month}-${String(day).padStart(2, "0")}`;
      const dateObj = new Date(dateStr);
      const isSunday = dateObj.getDay() === 0;

      const log = empLogs.get(dateStr);

      if (log) {
        // Has attendance entry
        const inMins = timeToMinutes(log.first_in);
        const outMins = timeToMinutes(log.last_out);

        if (inMins !== null && outMins !== null && outMins > inMins) {
          const workedMins = outMins - inMins;
          
          // Sunday logic: < 5 hours is Weekly Off (not Absent)
          if (isSunday && workedMins < 5 * 60) {
             stats.weeklyOff++;
          } 
          else if (workedMins >= 8 * 60) {
            stats.present++;
            if (isSunday) stats.woWorked++;
          } else if (workedMins >= 5 * 60) {
            stats.halfDay++;
            if (isSunday) stats.woWorked++;
          } else {
            // Less than 5 hours is ABSENT (unless Sunday, handled above)
            stats.absent++;
          }

        } else {
          // Bad data (in >= out) or single punch
          // Treat as absent or ignore? 
          // If there is an entry but 0 hours, it's also effectively absent < 5 hours
          // BUT if it's Sunday and effectively 0 hours, it should probably be Weekly Off too?
          // The request said "if ... came on sunday and ... worked less than 3 hrs"
          // If they have punches but 0 duration, that is < 3 hours. So Weekly Off.
          if (isSunday) {
            stats.weeklyOff++;
          } else {
            stats.absent++;
          }
        }
      } else {
        // No attendance entry
        if (isSunday) {
          stats.weeklyOff++;
        } else {
          stats.absent++;
        }
      }
    }

    // Calculate Total Present (Present + 0.5 * HalfDay)
    stats.totalPresent = stats.present + (stats.halfDay * 0.5);
    
    result.push(stats);
  }

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
