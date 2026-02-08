# Developer Guide - Attendance System

This document provides a comprehensive technical overview of the Attendance System. It is designed to help developers understand the architecture, data flow, and key components of the application.

---

## 🏗️ Architecture Overview

The application is built using **Electron** for the desktop shell and **React** for the user interface. It follows a classic multi-process architecture:

1.  **Main Process (`electron/`)**: Node.js environment. Handles OS interactions, database operations (`better-sqlite3`), file system access, and IPC (Inter-Process Communication) handlers.
2.  **Renderer Process (`src/`)**: React application. Handles the UI, state management, and user interactions. Communicates with the Main Process via a secure `ContextBridge`.
3.  **Database**: A local SQLite database (`attendance.db`) stored in the user's data directory.

---

## 📂 Project Structure

```
├── electron/               # Main Process code
│   ├── backend/            # Business logic & DB handling
│   │   ├── db.js           # Database initialization & schema
│   │   ├── ingest.js       # CSV parsing & data import logic
│   │   └── backup.js       # Automated DB backup system
│   ├── utils/              # Shared utilities
│   │   ├── logger.js       # Structured logging & rotation
│   │   └── validator.js    # Input validation (security)
│   ├── main.js             # Entry point, IPC handlers, app lifecycle
│   ├── preload.js          # Main-Renderer bridge (ContextBridge)
│   └── dateTimeUtils.js    # Date/Time helpers
│
├── src/                    # Renderer Process (React)
│   ├── components/         # UI Components (Reports, Upload, Calendar)
│   ├── utils/              # Frontend utilities
│   │   ├── api.js          # API fetch wrapper for IPC
│   │   └── ToastHost.js    # Toast notification system
│   ├── App.jsx             # Main application layout & routing
│   └── main.jsx            # React entry point
│
└── package.json            # Dependencies & scripts
```

---

## 🔄 Data Flow

### 1. IPC Communication Strategy
Instead of typical HTTP requests, the app uses Electron's IPC.
*   **Frontend**: Uses a helper `apiFetch` (in `src/utils/api.js`) which mimics the standard `fetch` API syntax but calls `window.api` methods.
*   **Bridge (`preload.js`)**: Exposes safe methods (`getEmployees`, `getLogs`, `uploadFile`) to the renderer using `contextBridge`.
*   **Backend (`main.js`)**: Listens for these IPC calls via `ipcMain.handle()`, executes the logic (often querying the DB), and returns the result.

### 2. File Upload & Ingestion
The critical path for data entering the system:
1.  **User Action**: Drag & drop CSV/Excel file in `UploadDialog.jsx`.
2.  **Frontend Validation**: Frontend checks file size (>10MB blocked) and extension.
3.  **IPC Transfer**: File buffer sent to Main process via `upload-file` channel.
4.  **Backend Processing (`main.js` & `ingest.js`)**:
    *   **Security**: Filename is sanitized, random ID generated, size re-verified.
    *   **Conversion**: Excel files are converted to CSV using `xlsx`.
    *   **Storage**: CSV saved to local storage.
    *   **Ingestion**: `ingest.js` streams the CSV, parsing row-by-row.
    *   **Normalization**: Date/Time formats are standardized.
    *   **DB Insert**: Records inserted into `attendance_logs` and `employees` tables.

### 3. Reporting Logic
Reports are generated on-demand by querying raw logs:
*   **Monthly Report**: Fetches all logs for a month. Backend logic iterates through logs to calculate per-day status (Full Day/Half Day/Absent) based on working minutes.
*   **Daily Report**: Fetches logs for a specific date. Calculates "First In", "Last Out", and total working time by subtracting break intervals (gaps between punches).

---

## 🗄️ Database Schema

The system uses `better-sqlite3`. Schema definitions are in `electron/backend/db.js`.

### `employees` Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT | Primary Key (e.g., "EMP001") |
| `name` | TEXT | Employee Name |

### `attendance_logs` Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | INTEGER | Auto Increment PK |
| `employee_id` | TEXT | Foreign Key -> `employees.id` |
| `date` | TEXT | Date of punch (YYYY-MM-DD) |
| `time` | TEXT | Time of punch (HH:MM:SS) |
| `source` | TEXT | 'Biometric' or 'Manual Upload' |
| `created_at` | TEXT | Timestamp |

**Constraints**: Unique composite constraint on `(employee_id, date, time)` prevents duplicate punch entries.

---

## 🔒 Security Implementation

The system implements several security layers suitable for a local desktop app:

1.  **Input Validation (`validator.js`)**:
    *   Centralized validation for all user inputs (Ids, names, filenames).
    *   Prevents SQL injection (via parameterized queries) and path traversal.
2.  **Secure File Handling**:
    *   Uploaded files are renamed with random tokens.
    *   Path separators stripped from filenames.
    *   Strict file size limits enforced (Frontend + Backend).
3.  **App Isolation**:
    *   `nodeIntegration: false` and `contextIsolation: true` in `BrowserWindow`.
    *   Preload script exposes only specific, safe API methods, not receiving raw `require`.
4.  **Logging & Audit**:
    *   `logger.js` writes structured logs.
    *   Sensitive actions (like file uploads or manual edits) are written to a separate audit log.

---

## 🛠️ Developer Workflow

### Running Locally
To start the development environment:
```bash
npm run dev
```
This runs `vite` (frontend) and `electron` (backend) concurrently.

### common Tasks

*   **Adding a new API Endpoint**:
    1.  Define the handler in `electron/main.js` using `ipcMain.handle('api:my-new-endpoint', ...)`.
    2.  Expose it in `electron/preload.js` via `contextBridge`.
    3.  Add it to the `apiFetch` routing in `src/utils/api.js`.
    4.  Call it from React using `apiFetch('/api/my-new-endpoint')`.

*   **Database Migrations**:
    Currently, the schema is created on startup in `db.js`. To add columns, edit the `CREATE TABLE` commands. For existing production databases, you would need to write specific `ALTER TABLE` logic in `db.js` to run on startup.

---
