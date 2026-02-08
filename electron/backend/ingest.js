import fs from "fs";
import path from "path";
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
export function ingestSingleFile(filePath, onProgress) {
  console.log(`Processing file: ${path.basename(filePath)}`);
  
  const result = {
    inserted: 0,
    skipped: 0,
    total: 0
  };
  
  try {
    // Report: Reading file
    onProgress?.({ progress: 0, message: "Reading file...", current: 0, total: 0 });
    
    const rows = readCSV(filePath);
    
    if (!rows.length) {
      logger.warn("No rows found in CSV", { file: path.basename(filePath) });
      onProgress?.({ progress: 100, message: "No records found", current: 0, total: 0 });
      return result;
    }
    
    result.total = rows.length;
    logger.info("Processing CSV rows", { file: path.basename(filePath), rows: rows.length });
    
    // Report: Parsing complete
    onProgress?.({ progress: 10, message: `Found ${rows.length} records`, current: 0, total: rows.length });
    
    /* Prepared statements */
    const insertEmployee = db.prepare(`
      INSERT OR IGNORE INTO employees (id, name)
      VALUES (?, ?)
    `);

    const insertLog = db.prepare(`
      INSERT OR IGNORE INTO attendance_logs
      (employee_id, date, time, source)
      VALUES (?, ?, ?, 'Manual Upload')
    `);
    
    // Process rows with progress
    const batchSize = Math.max(1, Math.floor(rows.length / 20)); // Report progress ~20 times
    
    db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        
        // Get raw values (handle different column name cases)
        const rawUserId = r.UserID || r.userId || r.user_id || r.EmployeeID || r.employee_id;
        const rawDate = r.Date || r.date || r.DATE;
        const rawTime = r.Time || r.time || r.TIME;
        
        // Validate employee ID
        const employeeIdValidation = validateEmployeeId(rawUserId);
        if (!employeeIdValidation.valid) {
          logger.warn("Skipping row with invalid employee ID", { row: i + 1, employeeId: rawUserId, error: employeeIdValidation.error });
          result.skipped++;
          continue;
        }
        const validatedEmployeeId = employeeIdValidation.value;
        
        // Normalize date and time for regional format support
        const normalizedDate = normalizeDate(rawDate);
        const normalizedTime = normalizeTime(rawTime);
        
        // Check for required fields and valid normalization
        if (!normalizedDate || !normalizedTime) {
          logger.warn("Skipping row with invalid date/time", { row: i + 1, date: rawDate, time: rawTime });
          result.skipped++;
          continue;
        }

        // Get and validate employee name
        const rawEmployeeName = r.EmployeeName || r.Name || r.name || r.employee_name || `Employee ${validatedEmployeeId}`;
        const employeeNameValidation = validateEmployeeName(rawEmployeeName);
        const employeeName = employeeNameValidation.valid ? employeeNameValidation.value : `Employee ${validatedEmployeeId}`;

        try {
          insertEmployee.run(validatedEmployeeId, employeeName);
          const info = insertLog.run(validatedEmployeeId, normalizedDate, normalizedTime);
          
          if (info.changes > 0) {
            result.inserted++;
          } else {
            // Duplicate entry (already exists)
            result.skipped++;
          }
        } catch (err) {
          logger.warn("Insert error for row", { row: i + 1, error: err.message });
          result.skipped++;
        }
        
        // Report progress periodically
        if ((i + 1) % batchSize === 0 || i === rows.length - 1) {
          const progressPercent = Math.round(((i + 1) / rows.length) * 100);
          onProgress?.({
            progress: progressPercent,
            message: `Inserting records...`,
            current: i + 1,
            total: rows.length
          });
        }
      }
    })();
    
    logger.info("File processing complete", { file: path.basename(filePath), inserted: result.inserted, skipped: result.skipped, total: result.total });
    
    onProgress?.({
      progress: 100,
      message: `Complete: ${result.inserted} inserted`,
      current: rows.length,
      total: rows.length
    });
    
    return result;
  } catch (err) {
    logger.error("File processing failed", { file: path.basename(filePath), error: err.message });
    throw err;
  }
}