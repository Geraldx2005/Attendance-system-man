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
  return crypto.randomBytes(32).toString('hex');
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

    if (date) {
      // Single-day punches
      rows = db
        .prepare(
          `
        SELECT date, time, source
        FROM attendance_logs
        WHERE employee_id = ?
          AND date = ?
        ORDER BY time
      `,
        )
        .all(employeeId, date);
      logger.debug("Fetched logs for single date", { employeeId, date, count: rows.length });
    } else if (from && to) {
      // Range punches (logs console)
      rows = db
        .prepare(
          `
        SELECT date, time, source
        FROM attendance_logs
        WHERE employee_id = ?
          AND date BETWEEN ? AND ?
        ORDER BY date, time
      `,
        )
        .all(employeeId, from, to);
      logger.debug("Fetched logs for date range", { employeeId, from, to, count: rows.length });
    } else {
      // All punches (fallback)
      rows = db
        .prepare(
          `
        SELECT date, time, source
        FROM attendance_logs
        WHERE employee_id = ?
        ORDER BY date, time
      `,
        )
        .all(employeeId);
      logger.debug("Fetched all logs", { employeeId, count: rows.length });
    }

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

// GET /api/attendance/:employeeId
ipcMain.handle("api:get-attendance", (_, { employeeId, month }) => {
  try {
    let rows;

    if (month) {
      const from = `${month}-01`;
      const to = `${month}-31`;

      // Fetch RAW punches only
      rows = db
        .prepare(
          `
        SELECT date, time
        FROM attendance_logs
        WHERE employee_id = ?
          AND date BETWEEN ? AND ?
        ORDER BY date, time
      `,
        )
        .all(employeeId, from, to);

      // Group punches by date
      const byDate = {};
      for (const r of rows) {
        if (!byDate[r.date]) byDate[r.date] = [];
        byDate[r.date].push(r.time);
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
            status: isSunday ? "Holiday" : (isPastDate(date) ? "Absent" : "Pending"),
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

          if (workedMinutes >= 8 * 60) {
            status = "Full Day";
          } else if (workedMinutes >= 5 * 60) {
            status = "Half Day";
          }
          // < 5 hours remains "Absent"
        } else {
           if (isSunday) { // If no work done on Sunday
             status = "Holiday";
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
      SELECT date, time
      FROM attendance_logs
      WHERE employee_id = ?
      ORDER BY date, time
    `,
      )
      .all(employeeId);

    const byDate = {};
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r.time);
    }

    const result = Object.entries(byDate).map(([date, punches]) => {
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
           status = "Extra";
        } else if (workedMinutes >= 8 * 60) {
            status = "Full Day";
        } else if (workedMinutes >= 5 * 60) {
            status = "Half Day";
        }
      } else {
         if (isSunday) {
             status = "Holiday";
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
    const randomName = crypto.randomBytes(8).toString('hex');
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
    
    const result = await ingestSingleFile(targetPath, (progressInfo) => {
      const baseProgress = 70;
      const maxProgress = 95;
      const range = maxProgress - baseProgress;
      const actualProgress = baseProgress + (progressInfo.progress / 100) * range;
      
      sendUploadProgress({
        phase: "inserting",
        progress: Math.round(actualProgress),
        message: progressInfo.message,
        current: progressInfo.current,
        total: progressInfo.total
      });
    }, sanitizedName);

    sendUploadProgress({ phase: "complete", progress: 100, message: "Upload complete!" });

    // Notify UI to refresh
    notifyAttendanceInvalidation({});

    logger.info("File upload completed", { filename: sanitizedName, inserted: result.inserted, skipped: result.skipped });

    return {
      ok: true,
      inserted: result.inserted,
      skipped: result.skipped,
      total: result.total
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
        uploaded_at AS uploadedAt
      FROM uploads
      ORDER BY uploaded_at DESC
    `
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
ipcMain.handle("api:delete-upload", (_, { uploadId }) => {
  try {
    if (!uploadId || typeof uploadId !== "string") {
      throw new Error("Invalid upload ID");
    }

    // First count how many logs will be deleted
    const countResult = db
      .prepare("SELECT COUNT(*) as count FROM attendance_logs WHERE upload_id = ?")
      .get(uploadId);
    const logsToDelete = countResult?.count || 0;

    // Delete the upload (cascade will delete related attendance_logs)
    const deleteResult = db
      .prepare("DELETE FROM uploads WHERE id = ?")
      .run(uploadId);

    if (deleteResult.changes === 0) {
      throw new Error("Upload not found");
    }

    // Also manually delete attendance logs (in case CASCADE doesn't trigger)
    db.prepare("DELETE FROM attendance_logs WHERE upload_id = ?").run(uploadId);

    logger.audit("Upload deleted", { uploadId, logsDeleted: logsToDelete });

    // Notify UI to refresh
    notifyAttendanceInvalidation({});

    return { ok: true, logsDeleted: logsToDelete };
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