# Attendance System

A comprehensive desktop application for managing employee attendance, built with Electron and React. This application provides a robust solution for tracking attendance, managing employee data, and generating reports.

## Features

- **Attendance Dashboard**: 
    - Calendar view showing daily attendance status (Present, Absent, Half Day, Holiday).
    - Summary statistics for the selected month.
- **Manual Data Upload**: 
    - Optimized for biometric `attlog` `.dat` files (also accepts legacy `.csv`, `.xls`, and `.xlsx`).
    - Real-time progress tracking for file reading, parsing, and database insertion.
    - Automatic conversion of Excel files to CSV; `.dat` files are ingested directly with second-level precision.
- **Employee Management**: 
    - Searchable employee list by ID or Name.
    - Detailed employee profiles.
    - Edit employee names directly within the app.
- **Logs Console**: 
    - Detailed view of all punch logs (In/Out times).
    - Filter logs by date range.
- **Reports**: 
    - Generate and view monthly attendance reports.
    - Export reports to PDF.
- **Theme Support**: 
    - Seamless Dark/Light mode toggle.
- **Local Database**: 
    - Built on SQLite for fast, reliable, and offline-capable data storage.

## Tech Stack

- **Frontend**: 
    - React 18
    - Vite
    - Tailwind CSS (v4)
    - Material UI & React Icons
    - FullCalendar (for calendar views)
- **Backend**: 
    - Electron
    - Node.js
    - SQLite (via `better-sqlite3`)
- **Utilities**: 
    - `xlsx` for Excel file processing
    - `csv-parse` for CSV handling
    - `jspdf` for report generation
    - `electron-store` for configuration persistence

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (Node Package Manager)

### Installation

1.  **Clone the repository** (if applicable) or navigate to the project directory.

2.  **Install dependencies**:
    ```bash
    npm install
    ```

### Running the Application

To start the application in development mode (with hot-reload):

```bash
npm run dev
```

This command runs both the Vite development server and the Electron app concurrently.

### Building for Production

To create a production build (generating an installer/executable):

```bash
npm run build
```

The output will be available in the `release` directory.

## Usage Guide

### Importing Attendance Data

1.  Click the **Upload (+) button** in the sidebar.
2.  Select your attendance file (`attlog .dat` from the device, or `.csv`/`.xls`/`.xlsx` if exported).
3.  The system will process the file and insert records into the database.
4.  **Required Columns / Fields**:
    - For `.dat` attlog exports: the file is line-based (`UserID <tab> YYYY-MM-DD HH:mm:ss ...`). No header is required.
    - For CSV/Excel uploads: 
        - `UserID` (or `EmployeeID`)
        - `Date` (YYYY-MM-DD or similar standard formats)
        - `Time` (HH:mm or HH:mm:ss)
        - `EmployeeName` (Optional, will auto-create employees if missing)

## Project Structure

```
attendance-system/
├── electron/               # Electron Main Process
│   ├── backend/            # Database and Data Ingestion logic
│   ├── main.js             # Application Entry Point
│   └── preload.js          # Preload script (Bridge between Main & Renderer)
├── src/                    # React Renderer Process
│   ├── components/         # UI Components (Dialogs, Calendar, etc.)
│   ├── utils/              # Helper functions
│   ├── App.jsx             # Main App Component
│   └── index.css           # Global Styles (Tailwind)
├── release/                # Build outputs
└── package.json            # Project dependencies and scripts
```

## License

[Add License Information Here]
