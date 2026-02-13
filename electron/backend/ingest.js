import fs from "fs";
import path from "path";
import crypto from "crypto";
import { parse } from "csv-parse/sync";
import db from "./db.js";
import { normalizeDate, normalizeTime } from "../dateTimeUtils.js";
import { validateEmployeeId, validateEmployeeName } from "../utils/validator.js";
import logger from "../utils/logger.js";

/* Remove BOM from string */
function removeBOM(str) {
  if (str.charCodeAt(0) === 0xFEFF) {
    return str.slice(1);
  }
  return str;
}

/* CSV Reader with BOM handling */
function readCSV(csvFilePath) {
  if (!fs.existsSync(csvFilePath)) {
    logger.error("CSV file not found", { path: csvFilePath });
    return [];
  }

  try {
    // Check file size - reject files larger than 10MB
    const stats = fs.statSync(csvFilePath);
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (stats.size > maxSize) {
      logger.error("CSV file too large", { path: csvFilePath, size: stats.size, maxSize });
      throw new Error(`File size exceeds 10MB limit`);
    }

    const file = fs.readFileSync(csvFilePath);
    const records = parse(file, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    });
    
    // Normalize column names by removing BOM from all keys
    const normalizedRecords = records.map(record => {
      const normalized = {};
      for (const [key, value] of Object.entries(record)) {
        const cleanKey = removeBOM(key.trim());
        normalized[cleanKey] = value;
      }
      return normalized;
    });
    
    logger.info("CSV file read successfully", { path: csvFilePath, records: normalizedRecords.length });
    return normalizedRecords;
  } catch (err) {
    logger.error("CSV read error", { path: csvFilePath, error: err.message });
    throw err;
  }
}

/* ================= SINGLE FILE INGEST WITH PROGRESS ================= */
export function ingestSingleFile(filePath, onProgress, originalFilename = null) {
  const filename = originalFilename || path.basename(filePath);
  console.log(`Processing file: ${filename}`);
  
  // Generate unique upload ID
  const uploadId = crypto.randomUUID();
  
  const result = {
    inserted: 0, 
    skipped: 0,
    total: 0,
    uploadId
  };
  
  try {
    // Report: Reading file
    onProgress?.({ progress: 0, message: "Reading file...", current: 0, total: 0 });
    
    const rows = readCSV(filePath);
    
    if (!rows.length) {
      logger.warn("No rows found in CSV", { file: filename });
      onProgress?.({ progress: 100, message: "No records found", current: 0, total: 0 });
      return result;
    }
    
    result.total = rows.length;
    logger.info("Processing CSV rows", { file: filename, rows: rows.length, uploadId });
    
    // Report: Parsing complete
    onProgress?.({ progress: 10, message: `Found ${rows.length} records`, current: 0, total: rows.length });
    
    /* Prepared statements */
    const insertEmployee = db.prepare(`
      INSERT OR IGNORE INTO employees (id, name)
      VALUES (?, ?)
    `);

    // Insert into attendance_logs (Raw Data)
    // We use INSERT OR IGNORE so if a punch exists (from another upload), we keep the original.
    // This implies "First upload wins" ownership of a punch.
    const insertLog = db.prepare(`
      INSERT OR IGNORE INTO attendance_logs (employee_id, date, time, upload_id)
      VALUES (?, ?, ?, ?)
    `);

    const insertUpload = db.prepare(`
      INSERT INTO uploads (id, filename, records_inserted, records_skipped)
      VALUES (?, ?, 0, 0)
    `);

    const updateUpload = db.prepare(`
      UPDATE uploads SET records_inserted = ?, records_skipped = ?, records_empty = ? WHERE id = ?
    `);
    
    // Group punches by Employee + Date to minimize aggregations
    // We still insert logs individually, but we trigger daily aggregation once per group
    const affectedDays = new Set(); // Strings of "EmpID|Date"
    let emptyRecordsCount = 0;

    // Transaction for bulk inserts
    db.transaction(() => {
        // Create upload record
        insertUpload.run(uploadId, filename);

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            
            // Get raw values (handle different column name cases)
            const rawUserId = r['Employee Code'] || r.EmployeeCode || r.UserID || r.userId || r.user_id || r.EmployeeID || r.employee_id;
            const rawDate = r.AttendanceDate || r.Attendance_Date || r.Date || r.date || r.DATE;
            const rawPunchRecords = r.PunchRecords || r.Punch_Records || r['Punch Records'] || r.Time || r.time || r.TIME;
            
            // Validate employee ID
            const employeeIdValidation = validateEmployeeId(rawUserId);
            if (!employeeIdValidation.valid) {
              result.skipped++;
              continue;
            }
            const validatedEmployeeId = employeeIdValidation.value;
            
            // Normalize date
            const normalizedDate = normalizeDate(rawDate);
            if (!normalizedDate) {
               result.skipped++;
               continue;
            }

            // Ensure employee exists
            try {
                insertEmployee.run(validatedEmployeeId, `Employee ${validatedEmployeeId}`);
            } catch (e) {}

            // Parse PunchRecords
            let timeEntries = [];
            if (rawPunchRecords) {
               const splits = rawPunchRecords.toString().split(/[,;\n|\s]+/);
               for (const t of splits) {
                 const trimmed = t.trim();
                 if (trimmed) {
                   const normTime = normalizeTime(trimmed);
                   if (normTime) {
                     timeEntries.push(normTime);
                   }
                 }
               }
            }
            
            if (timeEntries.length > 0) {
                // Insert logs
                let insertedForRecord = 0;
                for (const time of timeEntries) {
                    const info = insertLog.run(validatedEmployeeId, normalizedDate, time, uploadId);
                    if (info.changes > 0) insertedForRecord++;
                }

                if (insertedForRecord > 0) {
                    result.inserted++;
                    // Mark for aggregation
                    affectedDays.add(`${validatedEmployeeId}|${normalizedDate}`);
                } else {
                    result.skipped++; // All punches already existed
                    // Still mark for aggregation in case we need to update upload_ids (though we are relying on logs now)
                    // Actually, if we didn't insert, the daily_daily attendance might not strictly need update 
                    // unless we want to ensure consistency. Let's mark it to be safe.
                    affectedDays.add(`${validatedEmployeeId}|${normalizedDate}`);
                }

            } else {
                 // Empty record
                 emptyRecordsCount++;
            }
            
            // Progress
            if ((i + 1) % 500 === 0) {
                 onProgress?.({
                    progress: 10 + Math.round(((i + 1) / rows.length) * 40),
                    message: `Ingesting records...`,
                    current: i + 1,
                    total: rows.length
                  });
            }
        }
    })();

    // Aggregation Phase
    const groups = Array.from(affectedDays);
    const batchSize = Math.max(1, Math.floor(groups.length / 20));

    const upsertDaily = db.prepare(`
       INSERT INTO daily_attendance (employee_id, date, punches, upload_ids, updated_at)
       VALUES (?, ?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(employee_id, date) DO UPDATE SET
         punches = excluded.punches,
         upload_ids = excluded.upload_ids,
         updated_at = excluded.updated_at
    `);

    // We need to fetch ALL logs for these days to rebuild the Daily Attendance string
    // This is the "Truth" reconstruction
    const getLogsForDay = db.prepare(`
        SELECT time, upload_id 
        FROM attendance_logs 
        WHERE employee_id = ? AND date = ? 
        ORDER BY time ASC
    `);

    db.transaction(() => {
        for (let i = 0; i < groups.length; i++) {
            const [empId, date] = groups[i].split("|");
            
            const logs = getLogsForDay.all(empId, date);
            
            if (logs.length > 0) {
                const punches = logs.map(l => l.time).join(", ");
                // Collect unique upload IDs
                const uniqueUploads = new Set(logs.map(l => l.upload_id).filter(Boolean));
                const uploadIdsStr = [...uniqueUploads].join(",");
                
                upsertDaily.run(empId, date, punches, uploadIdsStr);
            }

            // Progress
            if ((i + 1) % batchSize === 0) {
                 onProgress?.({
                    progress: 50 + Math.round(((i + 1) / groups.length) * 40),
                    message: `Aggregating daily summaries...`,
                    current: i + 1,
                    total: groups.length
                  });
            }
        }
        
        // Final update to uploads table
        updateUpload.run(result.inserted, result.skipped, emptyRecordsCount, uploadId);
    })();
    
    logger.info("File processing complete", { file: filename, uploadId, inserted: result.inserted, skipped: result.skipped });
    
    onProgress?.({
      progress: 100,
      message: `Complete`,
      current: rows.length,
      total: rows.length
    });
    
    return result;
  } catch (err) {
    logger.error("File processing failed", { file: filename, uploadId, error: err.message });
    throw err;
  }
}
