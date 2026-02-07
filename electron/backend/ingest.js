import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import db from "./db.js";
import { normalizeDate, normalizeTime } from "../dateTimeUtils.js";

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
    console.error(`CSV file not found: ${csvFilePath}`);
    return [];
  }

  try {
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
    
    return normalizedRecords;
  } catch (err) {
    console.error(`CSV read error (${path.basename(csvFilePath)}): ${err.message}`);
    return [];
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
      console.log(`No rows found in ${path.basename(filePath)}`);
      onProgress?.({ progress: 100, message: "No records found", current: 0, total: 0 });
      return result;
    }
    
    result.total = rows.length;
    console.log(`Found ${rows.length} rows to process`);
    
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
        
        // Normalize date and time for regional format support
        const normalizedDate = normalizeDate(rawDate);
        const normalizedTime = normalizeTime(rawTime);
        
        // Check for required fields and valid normalization
        if (!rawUserId || !normalizedDate || !normalizedTime) {
          console.log(`Skipping invalid row ${i + 1} - UserID: ${rawUserId}, Date: ${rawDate}, Time: ${rawTime}`);
          result.skipped++;
          continue;
        }

        const employeeName = r.EmployeeName || r.Name || r.name || r.employee_name || `Employee ${rawUserId}`;

        try {
          insertEmployee.run(rawUserId, employeeName);
          const info = insertLog.run(rawUserId, normalizedDate, normalizedTime);
          
          if (info.changes > 0) {
            result.inserted++;
          } else {
            // Duplicate entry (already exists)
            result.skipped++;
          }
        } catch (err) {
          console.log(`Insert error for row ${i + 1}: ${err.message}`);
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
    
    console.log(`File processing complete: ${result.inserted} inserted, ${result.skipped} skipped`);
    
    onProgress?.({
      progress: 100,
      message: `Complete: ${result.inserted} inserted`,
      current: rows.length,
      total: rows.length
    });
    
    return result;
  } catch (err) {
    console.error(`File processing failed: ${err.message}`);
    throw err;
  }
}