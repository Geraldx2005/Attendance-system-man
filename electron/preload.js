const { contextBridge, ipcRenderer } = require("electron");

/* Extract internal token */
const tokenArg = process.argv.find((arg) => arg.startsWith("--internal-token="));

const INTERNAL_TOKEN = tokenArg ? tokenArg.split("=")[1] : null;

/* ─── IPC Event Bus ─────────────────────────────────────────────────────────── */
let nextId = 0;
const attendanceListeners = new Map();
const uploadProgressListeners = new Map();

// Attendance invalidation listener
ipcRenderer.on("attendance:invalidated", (_, data) => {
  for (const cb of [...attendanceListeners.values()]) {
    try {
      cb(data);
    } catch (_e) {
      /* isolate */
    }
  }
});

// Upload progress listener
ipcRenderer.on("upload:progress", (_, data) => {
  for (const cb of [...uploadProgressListeners.values()]) {
    try {
      cb(data);
    } catch (_e) {
      /* isolate */
    }
  }
});

contextBridge.exposeInMainWorld("ipc", {
  // Attendance invalidation events
  onAttendanceInvalidated: (cb) => {
    const id = nextId++;
    attendanceListeners.set(id, cb);
    return id;
  },
  offAttendanceInvalidated: (id) => {
    attendanceListeners.delete(id);
  },

  // File upload with progress
  uploadFile: (fileData) => ipcRenderer.invoke("upload-file", fileData),
  
  onUploadProgress: (cb) => {
    const id = nextId++;
    uploadProgressListeners.set(id, cb);
    return id;
  },
  offUploadProgress: (id) => {
    uploadProgressListeners.delete(id);
  },
});

/* API */
contextBridge.exposeInMainWorld("api", {
  getEmployees: () => ipcRenderer.invoke("api:get-employees"),
  getLogs: (employeeId, params) => ipcRenderer.invoke("api:get-logs", { employeeId, ...params }),
  getAttendance: (employeeId, month) => ipcRenderer.invoke("api:get-attendance", { employeeId, month }),
  getMonthlyReport: (month) => ipcRenderer.invoke("api:get-monthly-report", { month }),
  updateEmployeeName: (employeeId, name) => ipcRenderer.invoke("api:update-employee", { employeeId, name }),
  getUploadHistory: () => ipcRenderer.invoke("api:get-upload-history"),
  deleteUpload: (uploadId) => ipcRenderer.invoke("api:delete-upload", { uploadId }),
});

/* Internal token removed - not needed in renderer context */
