import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import Store from "electron-store";
import fs from "fs";
import { timeToMinutes as utilTimeToMinutes } from "./dateTimeUtils.js";

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
  return Math.random().toString(36).slice(2) + Date.now();
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

    return employees;
  } catch (err) {
    console.error("api:get-employees error:", err);
    throw err;
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
    }

    return rows;
  } catch (err) {
    console.error("api:get-logs error:", err);
    throw err;
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
          return {
            date,
            status: isPastDate(date) ? "Absent" : "Pending",
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

        if (inMin !== null && outMin !== null && outMin > inMin) {
          workedMinutes = outMin - inMin;

          if (workedMinutes >= 8 * 60) status = "Full Day";
          else if (workedMinutes >= 5 * 60) status = "Half Day";
        }

        return {
          date,
          status,
          firstIn,
          lastOut,
          workedMinutes,
        };
      });

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

      if (inMin !== null && outMin !== null && outMin > inMin) {
        workedMinutes = outMin - inMin;

        if (workedMinutes >= 8 * 60) status = "Full Day";
        else if (workedMinutes >= 5 * 60) status = "Half Day";
      }

      return {
        date,
        status,
        firstIn,
        lastOut,
        workedMinutes,
      };
    });

    return result;
  } catch (err) {
    console.error("api:get-attendance error:", err);
    throw err;
  }
});

// POST /api/employees/:employeeId (update name)
ipcMain.handle("api:update-employee", (_, { employeeId, name }) => {
  try {
    if (!name || !name.trim()) {
      throw new Error("Name required");
    }

    db.prepare(
      `
    UPDATE employees
    SET name = ?
    WHERE id = ?
  `,
    ).run(name.trim(), employeeId);

    // Notify UI to refresh lists
    notifyAttendanceInvalidation({ employeeId });

    return { ok: true };
  } catch (err) {
    console.error("api:update-employee error:", err);
    throw err;
  }
});

/* ================= IPC HANDLERS - FILE UPLOAD ================= */
ipcMain.handle("upload-file", async (_, { name, buffer, type }) => {
  try {
    // Send initial progress
    sendUploadProgress({ phase: "reading", progress: 0, message: "Preparing file..." });

    // Ensure CSV_PATH exists
    const csvPath = ensureCSVPath();
    if (!fs.existsSync(csvPath)) {
      fs.mkdirSync(csvPath, { recursive: true });
    }

    sendUploadProgress({ phase: "reading", progress: 20, message: "Reading file..." });

    // Create unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const ext = path.extname(name).toLowerCase();
    
    // Only process CSV files directly, for Excel files we need conversion
    let targetPath;
    if (ext === ".csv") {
      targetPath = path.join(csvPath, `attendance_upload_${timestamp}.csv`);
      
      // Write the buffer to file
      const uint8Array = new Uint8Array(buffer);
      fs.writeFileSync(targetPath, uint8Array);
      
      sendUploadProgress({ phase: "reading", progress: 40, message: "File saved..." });
    } else {
      // For Excel files, we need xlsx package - save as temp then convert
      targetPath = path.join(csvPath, `attendance_upload_${timestamp}.csv`);
      
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
      
      sendUploadProgress({ phase: "parsing", progress: 60, message: "Conversion complete..." });
    }

    sendUploadProgress({ phase: "inserting", progress: 70, message: "Processing records..." });

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
    });

    sendUploadProgress({ phase: "complete", progress: 100, message: "Upload complete!" });

    // Notify UI to refresh
    notifyAttendanceInvalidation({});

    return {
      ok: true,
      inserted: result.inserted,
      skipped: result.skipped,
      total: result.total
    };
  } catch (err) {
    console.error("upload-file error:", err);
    sendUploadProgress({ phase: "error", progress: 0, message: err.message });
    return { ok: false, error: err.message };
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

  console.log("User Data Path:", process.env.USER_DATA_PATH);
  console.log("CSV Path:", process.env.CSV_PATH);

  // Import and initialize DB
  const { initDB } = await import("./backend/db.js");
  db = initDB();

  // Create window
  createWindow();
});

// QUIT
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});