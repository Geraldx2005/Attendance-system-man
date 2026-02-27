import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import logger from "../utils/logger.js";

// ESM paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

// Initialize database connection - MUST be called after process.env.USER_DATA_PATH is set
export function initDB() {
  if (db) {
    return db; // Already initialized
  }

  if (!process.env.USER_DATA_PATH) {
    throw new Error("USER_DATA_PATH not set before DB initialization");
  }

  const USER_DATA_PATH = process.env.USER_DATA_PATH;
  const dbPath = path.join(USER_DATA_PATH, "attendance.db");

  logger.info("Initializing database", { path: dbPath });

  // Open DB
  db = new Database(dbPath);

  // Set restrictive file permissions (owner read/write only)
  try {
    if (process.platform !== "win32") {
      // On Unix-like systems, set permissions to 600 (rw-------)
      fs.chmodSync(dbPath, 0o600);
      logger.info("Set restrictive database file permissions");
    }
    // Note: Windows file permissions are handled differently via NTFS ACLs
    // For production Windows deployment, consider using icacls or similar
  } catch (err) {
    logger.warn("Failed to set database file permissions", { error: err.message });
  }

  // PRAGMAS
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // EMPLOYEES
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  // ATTENDANCE LOGS (PUNCHES ONLY)
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,      -- YYYY-MM-DD
      time TEXT NOT NULL,      -- HH:mm:ss
      source TEXT DEFAULT 'Biometric',
      created_at TEXT DEFAULT (datetime('now','localtime')),

      UNIQUE(employee_id, date, time),
      FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
    );
  `);

  // INDEXES
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_employee_date
      ON attendance_logs(employee_id, date);

    CREATE INDEX IF NOT EXISTS idx_logs_date
      ON attendance_logs(date);
  `);

  // UPLOADS TABLE (for tracking upload history)
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      records_inserted INTEGER DEFAULT 0,
      records_skipped INTEGER DEFAULT 0,
      records_empty INTEGER DEFAULT 0,
      uploaded_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // Add upload_id column to attendance_logs if not exists (migration)
  try {
    const columns = db.pragma("table_info(attendance_logs)");
    const hasUploadId = columns.some((col) => col.name === "upload_id");
    if (!hasUploadId) {
      db.exec(`ALTER TABLE attendance_logs ADD COLUMN upload_id TEXT REFERENCES uploads(id) ON DELETE CASCADE`);
      logger.info("Added upload_id column to attendance_logs");
    }
  } catch (err) {
    logger.warn("Failed to add upload_id column", { error: err.message });
  }

  // Add records_empty column to uploads if not exists (migration)
  try {
    const columns = db.pragma("table_info(uploads)");
    const hasEmpty = columns.some((col) => col.name === "records_empty");
    if (!hasEmpty) {
      db.exec(`ALTER TABLE uploads ADD COLUMN records_empty INTEGER DEFAULT 0`);
      logger.info("Added records_empty column to uploads");
    }
  } catch (err) {
    logger.warn("Failed to add records_empty column", { error: err.message });
  }

  // Migration: add in_time column to employees (default 10:00 AM)
  try {
    const empCols = db.pragma("table_info(employees)");
    if (!empCols.some((c) => c.name === "in_time")) {
      db.exec(`ALTER TABLE employees ADD COLUMN in_time TEXT NOT NULL DEFAULT '10:00'`);
      logger.info("Added in_time column to employees");
    }
  } catch (err) {
    logger.warn("Failed to add in_time column", { error: err.message });
  }

  // INDEX for upload_id lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_upload_id
      ON attendance_logs(upload_id);
  `);

  // DAILY ATTENDANCE (Aggregated punches)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      punches TEXT, -- Comma-separated string of times
      upload_ids TEXT, -- Comma-separated list of upload IDs
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(employee_id, date),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
  `);

  // MIGRATION: attendance_logs -> daily_attendance
  try {
    const rowCount = db.prepare("SELECT count(*) as count FROM daily_attendance").get().count;
    if (rowCount === 0) {
      const oldLogsCount = db.prepare("SELECT count(*) as count FROM attendance_logs").get().count;
      if (oldLogsCount > 0) {
        logger.info("Migrating attendance_logs to daily_attendance...");
        const allLogs = db.prepare("SELECT * FROM attendance_logs ORDER BY employee_id, date, time").all();

        // Group by emp+date
        const grouped = {};
        for (const log of allLogs) {
          const key = `${log.employee_id}|${log.date}`;
          if (!grouped[key]) {
            grouped[key] = {
              employee_id: log.employee_id,
              date: log.date,
              punches: [],
              upload_ids: new Set(),
            };
          }
          grouped[key].punches.push(log.time);
          if (log.upload_id) grouped[key].upload_ids.add(log.upload_id);
        }

        const insertDaily = db.prepare(`
          INSERT INTO daily_attendance (employee_id, date, punches, upload_ids)
          VALUES (?, ?, ?, ?)
        `);

        const insertMany = db.transaction((items) => {
          for (const item of items) {
            insertDaily.run(item.employee_id, item.date, item.punches.join(", "), [...item.upload_ids].join(","));
          }
        });

        insertMany(Object.values(grouped));
        logger.info("Migration complete", { records: Object.keys(grouped).length });
      }
    }
  } catch (err) {
    logger.error("Migration failed", { error: err.message });
  }

  // Create backups directory
  const backupDir = path.join(USER_DATA_PATH, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    logger.info("Created database backup directory", { path: backupDir });
  }

  // Perform integrity check
  try {
    const integrityCheck = db.pragma("integrity_check");
    if (integrityCheck[0]?.integrity_check === "ok") {
      logger.info("Database integrity check passed");
    } else {
      logger.warn("Database integrity check failed", { result: integrityCheck });
    }
  } catch (err) {
    logger.error("Failed to perform integrity check", { error: err.message });
  }

  logger.info("Database initialized successfully");

  return db;
}

// Get database instance - Throws error if not initialized
export function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Call initDB() first.");
  }
  return db;
}

// Default export for backward compatibility
export default {
  get prepare() {
    return getDB().prepare.bind(getDB());
  },
  get exec() {
    return getDB().exec.bind(getDB());
  },
  get pragma() {
    return getDB().pragma.bind(getDB());
  },
  get transaction() {
    return getDB().transaction.bind(getDB());
  },
  get backup() {
    return getDB().backup.bind(getDB());
  },
};
