import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import Store from "electron-store";
import fs from "fs";
import crypto from "crypto";
import { timeToMinutes as utilTimeToMinutes } from "./dateTimeUtils.js";
import { validateEmployeeName, sanitizeFilename, validateFileSize, validateFileExtension } from "./utils/validator.js";
import logger from "./utils/logger.js";
import { generateMonthlyReport } from "./backend/monthlyReport.js";
import { generateMonthlyGridReport } from "./backend/monthlyGridReport.js";

let db;

/* ================= SINGLE INSTANCE LOCK ================= */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/* ================= STORE ================= */
const store = new Store();

/* ================= CONFIG ================= */
const DEFAULT_CSV_PATH = "C:\\essl\\data";
/* ========================================= */

/* ================= INTERNAL TOKEN ================= */
function generateInternalToken() {
  // Use cryptographically secure random bytes instead of Math.random()
  return crypto.randomBytes(32).toString("hex");
}
const INTERNAL_TOKEN = generateInternalToken();

/* ================= PATH SETUP ================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

/* ================= CSV PATH ================= */
function ensureCSVPath() {
  let csvPath = store.get("csvPath");
  if (!csvPath) {
    csvPath = DEFAULT_CSV_PATH;
    store.set("csvPath", csvPath);
  }
  return csvPath;
}

/* ================= IPC → RENDERER ================= */
function notifyAttendanceInvalidation(payload) {
  if (!mainWindow) return;
  mainWindow.webContents.send("attendance:invalidated", payload);
}

/* ================= WINDOW ================= */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "../assets/icon.ico"),
    backgroundColor: "#0f0f0f",
    show: false,

    autoHideMenuBar: true,
    frame: true,
    titleBarStyle: "default",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      additionalArguments: [`--internal-token=${INTERNAL_TOKEN}`],
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });
}

/* ================= HELPER FUNCTIONS ================= */
function timeToMinutes(time) {
  return utilTimeToMinutes(time);
}

function isPastDate(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();

  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return d < today;
}

function getDatesInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();

  const result = [];
  for (let d = 1; d <= days; d++) {
    result.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  return result;
}

/* ================= IPC HANDLERS - API ================= */

// GET /api/employees
ipcMain.handle("api:get-employees", () => {
  try {
    const employees = db
      .prepare(
        `
      SELECT 
        id AS employeeId,
        name
      FROM employees
      ORDER BY 
        CAST(REPLACE(REPLACE(REPLACE(id, 'EMP', ''), 'FT', ''), '-', '') AS INTEGER),
        id
    `,
      )
      .all();

    logger.debug("Fetched employees list", { count: employees.length });
    return employees;
  } catch (err) {
    logger.error("Failed to fetch employees", { error: err.message });
    throw new Error("Failed to fetch employees list");
  }
});

// GET /api/logs/:employeeId
ipcMain.handle("api:get-logs", (_, { employeeId, date, from, to }) => {
  try {
    let rows;

    // We now query 'daily_attendance'
    if (date) {
      // Single-day
      rows = db
        .prepare(
          `
        SELECT date, punches, upload_ids
        FROM daily_attendance
        WHERE employee_id = ?
          AND date = ?
      `,
        )
        .all(employeeId, date);
      logger.debug("Fetched daily_attendance for single date", { employeeId, date, count: rows.length });
    } else if (from && to) {
      // Range
      rows = db
        .prepare(
          `
        SELECT date, punches, upload_ids
        FROM daily_attendance
        WHERE employee_id = ?
          AND date BETWEEN ? AND ?
        ORDER BY date
      `,
        )
        .all(employeeId, from, to);
      logger.debug("Fetched daily_attendance for date range", { employeeId, from, to, count: rows.length });
    } else {
      // All
      rows = db
        .prepare(
          `
        SELECT date, punches, upload_ids
        FROM daily_attendance
        WHERE employee_id = ?
        ORDER BY date
      `,
        )
        .all(employeeId);
      logger.debug("Fetched all daily_attendance", { employeeId, count: rows.length });
    }

    // Transform for frontend consistency if needed, or send as is
    // The frontend expects to parse "punches" string now.
    return rows;
  } catch (err) {
    logger.error("Failed to fetch logs", { employeeId, error: err.message });
    throw new Error("Failed to fetch attendance logs");
  }
});

// GET /api/monthly-report (OPTIMIZED - single batch query)
ipcMain.handle("api:get-monthly-report", (_, { month }) => {
  try {
    const report = generateMonthlyReport(month);
    return report;
  } catch (err) {
    logger.error("Failed to generate monthly report", { month, error: err.message });
    throw new Error("Failed to generate monthly report");
  }
});

// GET /api/monthly-grid-report (day-by-day grid)
ipcMain.handle("api:get-monthly-grid-report", (_, { month }) => {
  try {
    const report = generateMonthlyGridReport(month);
    return report;
  } catch (err) {
    logger.error("Failed to generate monthly grid report", { month, error: err.message });
    throw new Error("Failed to generate monthly grid report");
  }
});

// GET /api/attendance/:employeeId
ipcMain.handle("api:get-attendance", (_, { employeeId, month }) => {
  try {
    let rows;

    if (month) {
      const from = `${month}-01`;
      const to = `${month}-31`;

      // Fetch aggregated punches
      rows = db
        .prepare(
          `
        SELECT date, punches
        FROM daily_attendance
        WHERE employee_id = ?
          AND date BETWEEN ? AND ?
        ORDER BY date
      `,
        )
        .all(employeeId, from, to);

      // Map to quick lookup
      const byDate = {};
      for (const r of rows) {
        // Punches is a string "HH:MM:SS, HH:MM:SS"
        if (r.punches) {
          byDate[r.date] = r.punches
            .split(", ")
            .map((t) => t.trim())
            .filter(Boolean);
        }
      }

      // Generate full month calendar
      const allDates = getDatesInMonth(month);

      const result = allDates.map((date) => {
        const punches = byDate[date] || [];

        // No punches
        if (!punches.length) {
          const dateObj = new Date(date);
          const isSunday = dateObj.getDay() === 0;

          return {
            date,
            status: isSunday ? "Weekly Off" : isPastDate(date) ? "Absent" : "Pending",
            firstIn: null,
            lastOut: null,
            workedMinutes: 0,
          };
        }

        // Derive IN / OUT
        const firstIn = punches[0];
        const lastOut = punches[punches.length - 1];

        let workedMinutes = 0;
        let status = "Absent";

        const inMin = timeToMinutes(firstIn);
        const outMin = timeToMinutes(lastOut);

        const dateObj = new Date(date);
        const isSunday = dateObj.getDay() === 0;

        if (inMin !== null && outMin !== null && outMin > inMin) {
          workedMinutes = outMin - inMin;

          if (isSunday) {
            if (workedMinutes >= 5 * 60) {
              status = "WO Worked"; // Worked enough on Sunday
            } else {
              status = "Weekly Off"; // Worked but less than 5h on Sunday
            }
          } else {
            // Weekday logic
            if (workedMinutes >= 8 * 60) {
              status = "Full Day";
            } else if (workedMinutes >= 5 * 60) {
              status = "Half Day";
            }
            // < 5 hours remains "Absent"
          }
        } else {
          if (isSunday) {
            // If no work done on Sunday
            status = "Weekly Off";
          }
        }

        return {
          date,
          status,
          firstIn,
          lastOut,
          workedMinutes,
        };
      });

      logger.debug("Fetched attendance for month", { employeeId, month, days: result.length });
      return result;
    }

    /* -------- Fallback: all dates (no month filter) -------- */

    rows = db
      .prepare(
        `
      SELECT date, punches
      FROM daily_attendance
      WHERE employee_id = ?
      ORDER BY date
    `,
      )
      .all(employeeId);

    const result = rows.map((r) => {
      const punches = r.punches ? r.punches.split(", ").map((t) => t.trim()) : [];
      const firstIn = punches[0] || null;
      const lastOut = punches[punches.length - 1] || null;

      let workedMinutes = 0;
      let status = "Absent";

      const inMin = timeToMinutes(firstIn);
      const outMin = timeToMinutes(lastOut);

      const dateObj = new Date(r.date);
      const isSunday = dateObj.getDay() === 0;

      if (inMin !== null && outMin !== null && outMin > inMin) {
        workedMinutes = outMin - inMin;

        if (isSunday) {
          status = "WO Worked";
        } else if (workedMinutes >= 8 * 60) {
          status = "Full Day";
        } else if (workedMinutes >= 5 * 60) {
          status = "Half Day";
        }
      } else {
        if (isSunday) {
          status = "Weekly Off";
        }
      }

      return {
        date: r.date,
        status,
        firstIn,
        lastOut,
        workedMinutes,
      };
    });

    logger.debug("Fetched attendance (all dates)", { employeeId, days: result.length });
    return result;
  } catch (err) {
    logger.error("Failed to fetch attendance", { employeeId, month, error: err.message });
    throw new Error("Failed to fetch attendance data");
  }
});

// POST /api/employees/:employeeId (update name)
ipcMain.handle("api:update-employee", (_, { employeeId, name }) => {
  try {
    // Validate employee name using centralized validator
    const validation = validateEmployeeName(name);
    if (!validation.valid) {
      logger.warn("Employee name validation failed", { employeeId, error: validation.error });
      throw new Error(validation.error);
    }

    const validatedName = validation.value;

    db.prepare(
      `
    UPDATE employees
    SET name = ?
    WHERE id = ?
  `,
    ).run(validatedName, employeeId);

    // Audit log for employee name changes
    logger.audit("Employee name updated", { employeeId, newName: validatedName });

    // Notify UI to refresh lists
    notifyAttendanceInvalidation({ employeeId });

    return { ok: true };
  } catch (err) {
    logger.error("Failed to update employee name", { employeeId, error: err.message });
    // Return sanitized error message
    throw new Error(err.message || "Failed to update employee name");
  }
});

/* ================= IPC HANDLERS - FILE UPLOAD ================= */
ipcMain.handle("upload-file", async (_, { name, buffer, type }) => {
  try {
    // Send initial progress
    sendUploadProgress({ phase: "reading", progress: 0, message: "Preparing file..." });

    // Validate file size (10MB limit)
    const bufferSize = buffer.length;
    const sizeValidation = validateFileSize(bufferSize, 10);
    if (!sizeValidation.valid) {
      logger.warn("File upload rejected - size validation failed", { error: sizeValidation.error, size: bufferSize });
      throw new Error(sizeValidation.error);
    }

    // Validate file extension
    const extValidation = validateFileExtension(name);
    if (!extValidation.valid) {
      logger.warn("File upload rejected - extension validation failed", { error: extValidation.error, filename: name });
      throw new Error(extValidation.error);
    }

    // Sanitize filename to prevent path traversal
    const sanitizedName = sanitizeFilename(name);
    if (!sanitizedName) {
      logger.warn("File upload rejected - filename sanitization failed", { filename: name });
      throw new Error("Invalid filename");
    }

    // Ensure CSV_PATH exists
    const csvPath = ensureCSVPath();
    if (!fs.existsSync(csvPath)) {
      fs.mkdirSync(csvPath, { recursive: true });
    }

    sendUploadProgress({ phase: "reading", progress: 20, message: "Reading file..." });

    // Generate secure random filename using crypto instead of timestamp
    const randomName = crypto.randomBytes(8).toString("hex");
    const ext = extValidation.extension;

    // Only process CSV files directly, for Excel files we need conversion
    let targetPath;
    if (ext === ".csv") {
      targetPath = path.join(csvPath, `attendance_upload_${randomName}.csv`);

      // Write the buffer to file
      const uint8Array = new Uint8Array(buffer);
      fs.writeFileSync(targetPath, uint8Array);

      logger.info("CSV file uploaded", { filename: sanitizedName, path: targetPath, size: bufferSize });
      sendUploadProgress({ phase: "reading", progress: 40, message: "File saved..." });
    } else {
      // For Excel files, we need xlsx package - save as temp then convert
      targetPath = path.join(csvPath, `attendance_upload_${randomName}.csv`);

      // Dynamic import for xlsx
      const XLSX = await import("xlsx");

      sendUploadProgress({ phase: "parsing", progress: 30, message: "Parsing Excel file..." });

      const uint8Array = new Uint8Array(buffer);
      const workbook = XLSX.read(uint8Array, { type: "array" });

      sendUploadProgress({ phase: "parsing", progress: 50, message: "Converting to CSV..." });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to CSV
      const csvContent = XLSX.utils.sheet_to_csv(sheet);
      fs.writeFileSync(targetPath, csvContent);

      logger.info("Excel file uploaded and converted", { filename: sanitizedName, path: targetPath, size: bufferSize });
      sendUploadProgress({ phase: "parsing", progress: 60, message: "Conversion complete..." });
    }

    sendUploadProgress({ phase: "inserting", progress: 70, message: "Processing records..." });

    // Audit log file upload
    logger.audit("File uploaded", { filename: sanitizedName, size: bufferSize, type: ext });

    // Import and run ingest with progress callback
    const { ingestSingleFile } = await import("./backend/ingest.js");

    const result = await ingestSingleFile(
      targetPath,
      (progressInfo) => {
        const baseProgress = 70;
        const maxProgress = 95;
        const range = maxProgress - baseProgress;
        const actualProgress = baseProgress + (progressInfo.progress / 100) * range;

        sendUploadProgress({
          phase: "inserting",
          progress: Math.round(actualProgress),
          message: progressInfo.message,
          current: progressInfo.current,
          total: progressInfo.total,
        });
      },
      sanitizedName,
    );

    sendUploadProgress({ phase: "complete", progress: 100, message: "Upload complete!" });

    // Notify UI to refresh
    notifyAttendanceInvalidation({});

    logger.info("File upload completed", {
      filename: sanitizedName,
      inserted: result.inserted,
      skipped: result.skipped,
    });

    return {
      ok: true,
      inserted: result.inserted,
      skipped: result.skipped,
      total: result.total,
    };
  } catch (err) {
    logger.error("File upload failed", { error: err.message });
    sendUploadProgress({ phase: "error", progress: 0, message: err.message });
    return { ok: false, error: err.message };
  }
});

/* ================= IPC HANDLERS - UPLOAD HISTORY ================= */

// GET /api/upload-history
ipcMain.handle("api:get-upload-history", () => {
  try {
    const uploads = db
      .prepare(
        `
      SELECT 
        id,
        filename,
        records_inserted AS recordsInserted,
        records_skipped AS recordsSkipped,
        records_empty AS recordsEmpty,
        uploaded_at AS uploadedAt
      FROM uploads
      ORDER BY uploaded_at DESC
    `,
      )
      .all();

    logger.debug("Fetched upload history", { count: uploads.length });
    return uploads;
  } catch (err) {
    logger.error("Failed to fetch upload history", { error: err.message });
    throw new Error("Failed to fetch upload history");
  }
});

// DELETE /api/delete-upload
ipcMain.handle("api:delete-upload", (_, props) => {
  const uploadId = props?.uploadId;

  try {
    logger.info("Delete upload request received", { uploadId });

    if (!uploadId || typeof uploadId !== "string") {
      throw new Error("Invalid upload ID");
    }

    // 1. Check if upload exists and delete metadata
    const deleteUpload = db.prepare("DELETE FROM uploads WHERE id = ?");

    // 2. Identify affected days BEFORE deleting logs (so we know what to re-aggregate)
    const getAffectedDays = db.prepare(`
        SELECT DISTINCT employee_id, date 
        FROM attendance_logs 
        WHERE upload_id = ?
    `);

    // 3. Delete from attendance_logs
    const deleteLogs = db.prepare("DELETE FROM attendance_logs WHERE upload_id = ?");

    // 4. Re-aggregation statements
    const getLogsForDay = db.prepare(`
        SELECT time, upload_id 
        FROM attendance_logs 
        WHERE employee_id = ? AND date = ? 
        ORDER BY time ASC
    `);

    const upsertDaily = db.prepare(`
       INSERT INTO daily_attendance (employee_id, date, punches, upload_ids, updated_at)
       VALUES (?, ?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(employee_id, date) DO UPDATE SET
         punches = excluded.punches,
         upload_ids = excluded.upload_ids,
         updated_at = excluded.updated_at
    `);

    const deleteDaily = db.prepare("DELETE FROM daily_attendance WHERE employee_id = ? AND date = ?");

    let logsDeletedCount = 0;
    let legacyUpdatedCount = 0;

    db.transaction(() => {
      // A. Get affected Scope
      const affectedRows = getAffectedDays.all(uploadId);

      // B. Delete Upload Record
      const res = deleteUpload.run(uploadId);
      if (res.changes === 0) throw new Error("Upload not found");

      // C. Delete Raw Logs
      const logRes = deleteLogs.run(uploadId);
      logsDeletedCount = logRes.changes;

      // D. Re-aggregate affected days
      for (const row of affectedRows) {
        const { employee_id, date } = row;

        // Fetch remaining logs
        const logs = getLogsForDay.all(employee_id, date);

        if (logs.length > 0) {
          // Determine new state
          const punches = logs.map((l) => l.time).join(", ");
          const uniqueUploads = new Set(logs.map((l) => l.upload_id).filter(Boolean));
          const uploadIdsStr = [...uniqueUploads].join(",");

          upsertDaily.run(employee_id, date, punches, uploadIdsStr);
        } else {
          // No logs left for this day -> Delete daily record
          deleteDaily.run(employee_id, date);
        }
      }

      // Fallback for Legacy Data (Soft Delete)
      // If no attendance_logs were found (migrated data?), we still need to clear the upload_id reference
      // from daily_attendance to be consistent, even if strict data deletion isn't possible.
      if (logsDeletedCount === 0) {
        const affectedLegacy = db
          .prepare("SELECT id, upload_ids FROM daily_attendance WHERE upload_ids LIKE ?")
          .all(`%${uploadId}%`);
        const updateLegacy = db.prepare("UPDATE daily_attendance SET upload_ids = ? WHERE id = ?");
        for (const row of affectedLegacy) {
          const ids = row.upload_ids.split(",");
          const newIds = ids.filter((id) => id !== uploadId);
          updateLegacy.run(newIds.join(","), row.id);
          legacyUpdatedCount++;
        }
      }
    })();

    logger.audit("Upload deleted successfully", {
      uploadId,
      logsDeleted: logsDeletedCount,
      legacyUpdated: legacyUpdatedCount,
    });

    notifyAttendanceInvalidation({});
    return { ok: true, logsDeleted: logsDeletedCount + legacyUpdatedCount };
  } catch (err) {
    logger.error("Failed to delete upload", { uploadId, error: err.message });
    throw new Error(err.message || "Failed to delete upload");
  }
});

function sendUploadProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("upload:progress", data);
  }
}

/* ================= APP START ================= */
app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";

  // SET ENV VARS
  process.env.USER_DATA_PATH = app.getPath("userData");
  process.env.CSV_PATH = ensureCSVPath();

  // Initialize logger
  logger.init(process.env.USER_DATA_PATH);
  logger.info("Application starting", { userDataPath: process.env.USER_DATA_PATH, csvPath: process.env.CSV_PATH });

  // Import and initialize DB
  const { initDB } = await import("./backend/db.js");
  db = initDB();

  // Schedule automatic database backups
  const { scheduleAutomaticBackups } = await import("./backend/backup.js");
  scheduleAutomaticBackups(db, process.env.USER_DATA_PATH);

  // Create window
  createWindow();
});

// QUIT
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
