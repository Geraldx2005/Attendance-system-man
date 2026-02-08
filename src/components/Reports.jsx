import { useState, useMemo, useEffect } from "react";
import { MaterialReactTable } from "material-react-table";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import SettingsDialog from "./SettingsDialog";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiFetch } from "../utils/api";

// React-Datepicker (Month Picker)
const monthPickerStyles = `
.dark-monthpicker-wrapper {
    position: relative;
    z-index: 9999;
}

.dark-monthpicker-wrapper .react-datepicker-wrapper {
    width: 160px;
}

.dark-datepicker-wrapper .react-datepicker__input-container {
    width: 100%;
}

.dark-monthpicker-wrapper .react-datepicker__input-container .react-datepicker-custom-input {
    background-color: #0f0f0f;
    border: 2px solid #262626;
    border-radius: 8px;
    color: #e5e7eb;
    padding: 8px 12px;
    padding-right: 30px;
    font-size: 14px;
    width: 100%;
    cursor: pointer;
    transition: all 0.2s ease;
}

.dark-monthpicker-wrapper .react-datepicker__input-container .react-datepicker-custom-input:hover {
    border-color: rgba(16, 185, 129, 0.5);
}

.dark-monthpicker-wrapper .react-datepicker__input-container .react-datepicker-custom-input:focus {
    outline: none;
    border-color: rgba(16, 185, 129, 0.8);
}

.dark-monthpicker-wrapper .react-datepicker__input-container .react-datepicker-custom-input::placeholder {
    color: #CBD5E1;
}

/* Popper */
.dark-monthpicker-popper {
    z-index: 9999 !important;
}

.dark-monthpicker-popper .react-datepicker {
    background-color: #141414;
    border: 1px solid #262626;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    font-family: inherit;
    overflow: hidden;
}

.dark-monthpicker-popper .react-datepicker__header {
    background-color: #1a1a1a;
    border-bottom: 1px solid #262626;
    padding: 12px;
}

.dark-monthpicker-popper .react-datepicker__current-month,
.dark-monthpicker-popper .react-datepicker-year-header {
    color: #e5e7eb;
    font-size: 15px;
    font-weight: 600;
}

.dark-monthpicker-popper .react-datepicker__month-wrapper {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    padding: 2px;
}

/* Month text (base) */
.dark-monthpicker-popper .react-datepicker__month-text {
    color: #e5e7eb;
    font-size: 13px;
    width: 70px;
    padding: 4px;
    margin: 4px;
    border-radius: 5px;
    transition: all 0.15s ease;
}

/* Hover (non-disabled only) */
.dark-monthpicker-popper
.react-datepicker__month-text:hover:not(.react-datepicker__month-text--disabled) {
    background-color: #262626;
    color: #ffffff;
}

/* Selected */
.dark-monthpicker-popper .react-datepicker__month-text--selected,
.dark-monthpicker-popper .react-datepicker__month-text--keyboard-selected {
    background-color: #10b981 !important;
    color: #000 !important;
    font-weight: 600;
}

/* Disabled months */
.dark-monthpicker-popper .react-datepicker__month-text--disabled {
    color: #838E9A !important;
    opacity: 1;
    cursor: not-allowed;
}

/* Kill hover on disabled */
.dark-monthpicker-popper
.react-datepicker__month-text--disabled:hover {
    background-color: transparent;
}

/* Navigation */
.dark-monthpicker-popper .react-datepicker__navigation {
    top: 10px;
}

.dark-monthpicker-popper .react-datepicker__navigation-icon::before {
    border-color: #9ca3af;
}

.dark-monthpicker-popper
.react-datepicker__navigation:hover
.react-datepicker__navigation-icon::before {
    border-color: #10b981;
}

.dark-monthpicker-popper .react-datepicker__triangle {
    display: none;
}
`;


const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Dark MUI Theme
const darkMuiTheme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#0b0b0b",
      paper: "#0b0b0b",
    },
    text: {
      primary: "#e5e7eb",
      secondary: "#9ca3af",
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
  },
});

// Fetch Monthly Report (OPTIMIZED - single batch query)
async function fetchMonthlyReport(month, year) {
  const monthIndex = MONTHS.indexOf(month) + 1;
  const monthKey = `${year}-${String(monthIndex).padStart(2, "0")}`;

  // Single optimized API call - replaces N+1 queries
  const res = await apiFetch(`/api/monthly-report?month=${monthKey}`);
  const data = await res.json();

  // Map to expected format (employeeName instead of just name)
  return data.map(emp => ({
    employeeName: emp.employeeName,
    present: emp.present,
    halfDay: emp.halfDay,
    absent: emp.absent,
    totalPresent: emp.totalPresent,
  }));
}

// Component
export default function Reports({ onGenerated }) {
  const [rows, setRows] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState(""); // "excel" or "pdf"
  const [error, setError] = useState(null);

  const CustomDateInput = ({ value, onClick }) => (
    <input
      type="text"
      className="react-datepicker-custom-input"
      onClick={onClick}
      value={value}
      readOnly={true}
      placeholder="Select month"
    />
  );

  // Get month name and year from selected date
  const getMonthYear = () => {
    if (!selectedDate) return { month: null, year: null };
    const monthName = MONTHS[selectedDate.getMonth()];
    const year = String(selectedDate.getFullYear());
    return { month: monthName, year };
  };

  const generateReport = async () => {
    try {
      if (!selectedDate) {
        setError("Please select a month");
        return;
      }

      setError(null);
      setIsGenerating(true);

      const { month, year } = getMonthYear();
      const data = await fetchMonthlyReport(month, year);
      setRows(data);

      onGenerated?.(month, year);
    } catch (err) {
      console.error("Monthly report failed", err);
      setError("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-generate report when date is selected
  useEffect(() => {
    if (selectedDate) {
      generateReport();
    }
  }, [selectedDate]);

  const exportExcel = async () => {
    try {
      setIsExporting(true);
      setExportType("excel");

      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 100));

      // TRANSFORM DATA (ORDER + HEADERS)
      const data = tableData.map(r => ({
        "Employee ID": r.employeeId,
        "Employee Name": r.employeeName,
        "Present Days": r.present,
        "Half Days": r.halfDay,
        "Absent Days": r.absent,
        "Total Present Days": r.totalPresent,
        "Attendance Percentage": Number(r.attendancePct) / 100, // real %
      }));

      const ws = XLSX.utils.json_to_sheet(data, {
        origin: "A2",
        skipHeader: true,
      });

      // HEADER ROW 
      const headers = Object.keys(data[0]);
      headers.forEach((h, i) => {
        const cell = XLSX.utils.encode_cell({ r: 0, c: i });
        ws[cell] = {
          v: h,
          t: "s",
          s: {
            font: { bold: true },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" },
            },
          },
        };
      });

      // HEADER ROW HEIGHT (PROFESSIONAL)
      ws["!rows"] = [{ hpt: 20 }];

      ws["!autofilter"] = {
        ref: ws["!ref"],
      };

      // COLUMN WIDTHS (PROFESSIONAL)
      ws["!cols"] = [
        { wch: 14 }, // Employee ID
        { wch: 22 }, // Name
        { wch: 14 },
        { wch: 12 },
        { wch: 14 },
        { wch: 18 },
        { wch: 22 },
      ];

      // ALIGNMENT & BORDERS
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = 1; R <= range.e.r; R++) {
        for (let C = 0; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[addr];
          if (!cell) continue;

          cell.s = {
            alignment: {
              horizontal: C === 1 ? "left" : "center",
              vertical: "center",
            },
            border: {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" },
            },
          };

          // Attendance % column formatting
          if (C === 6) {
            cell.z = "0.0%";
          }
        }
      }

      // FREEZE HEADER ROW
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };

      // WORKBOOK
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Monthly Attendance");

      const { month, year } = getMonthYear();
      XLSX.writeFile(wb, `Monthly Attendance Report ${month}-${year}.xlsx`);

      setError(null);
    } catch (err) {
      console.error("Excel export failed", err);
      setError("Failed to export Excel file. Please try again.");
    } finally {
      setIsExporting(false);
      setExportType("");
    }
  };

  const exportPDF = async () => {
    try {
      setIsExporting(true);
      setExportType("pdf");

      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 100));

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const { month: m, year } = getMonthYear();

      // COLORS (STRICT B/W)
      const COLORS = {
        text: "#000000",
        muted: "#4b5563",
        border: "#000000",
        headerBg: "#f2f2f2",
        rowAlt: "#fafafa",
      };

      // HEADER (COMPACT, NO WASTE)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(COLORS.text);
      doc.text("Monthly Attendance Report", 36, 28);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(COLORS.muted);
      doc.text(`Period: ${m} ${year}`, pageWidth - 36, 28, { align: "right" });

      doc.setDrawColor(COLORS.border);
      doc.setLineWidth(0.8);
      doc.line(36, 36, pageWidth - 36, 36);

      // TABLE (FULL WIDTH)
      autoTable(doc, {
        startY: 44,
        margin: { left: 36, right: 36 },
        tableWidth: pageWidth,

        head: [[
          "Employee ID",
          "Employee Name",
          "Present",
          "Half Day",
          "Absent",
          "Total Present",
          "Attendance %",
        ]],

        body: tableData.map(r => [
          r.employeeId,
          r.employeeName,
          r.present,
          r.halfDay,
          r.absent,
          r.totalPresent,
          `${r.attendancePct}%`,
        ]),

        theme: "grid",

        headStyles: {
          fillColor: COLORS.headerBg,
          textColor: COLORS.text,
          fontStyle: "bold",
          fontSize: 8.5,
          halign: "center",
          valign: "middle",
          lineColor: COLORS.border,
          lineWidth: 0.5,
          cellPadding: 4,
        },

        styles: {
          fontSize: 8,
          textColor: COLORS.text,
          lineColor: COLORS.border,
          lineWidth: 0.3,
          cellPadding: 3.5,
        },

        columnStyles: {
          0: { halign: "center", cellWidth: 60 },
          1: { halign: "left", cellWidth: 125 },
          2: { halign: "center", cellWidth: 50 },
          3: { halign: "center", cellWidth: 50 },
          4: { halign: "center", cellWidth: 50 },
          5: { halign: "center", cellWidth: 80 },
          6: { halign: "center", cellWidth: 108 },
        },

        alternateRowStyles: {
          fillColor: COLORS.rowAlt,
        },

        didDrawPage: (data) => {
          const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
          const totalPages = doc.internal.getNumberOfPages();

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(COLORS.muted);

          doc.text(
            `Page ${pageNum} of ${totalPages}`,
            20,
            pageHeight - 22
          );
        },
      });

      // FOOTER (TIMESTAMP)
      const now = new Date();
      const formattedDateTime = now.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(COLORS.muted);

      doc.text(
        `Generated on: ${formattedDateTime}`,
        pageWidth - 20,
        pageHeight - 22,
        { align: "right" }
      );

      doc.save(`Monthly Attendance Report ${m}-${year}.pdf`);

      setError(null);
    } catch (err) {
      console.error("PDF export failed", err);
      setError("Failed to export PDF file. Please try again.");
    } finally {
      setIsExporting(false);
      setExportType("");
    }
  };

  function getAttendanceBadge(pct) {
    const v = Number(pct);

    if (v < 30) {
      return "bg-red-500/15 text-red-400";
    }

    if (v < 75) {
      return "bg-amber-500/15 text-amber-400";
    }

    return "bg-emerald-500/15 text-emerald-400";
  }

  // Table Data
  const tableData = useMemo(() => {
    return rows.map((r, idx) => {
      const days = r.present + r.halfDay + r.absent;
      const pct = days
        ? ((r.totalPresent / days) * 100).toFixed(1)
        : "0.0";

      return {
        employeeId: `EMP${String(idx + 1).padStart(3, "0")}`,
        employeeName: r.employeeName,
        present: r.present,
        halfDay: r.halfDay,
        absent: r.absent,
        totalPresent: r.totalPresent,
        attendancePct: pct,
      };
    });
  }, [rows]);

  // Columns
  const columns = useMemo(
    () => [
      { accessorKey: "employeeId", header: "ID", size: 110 },
      { accessorKey: "employeeName", header: "Employee", size: 260 },

      {
        accessorKey: "present",
        header: "Present",
        Cell: ({ cell }) => (
          <span className="font-semibold text-emerald-400">{cell.getValue()}</span>
        ),
      },
      {
        accessorKey: "halfDay",
        header: "Half Day",
        Cell: ({ cell }) => (
          <span className="font-semibold text-amber-400">{cell.getValue()}</span>
        ),
      },
      {
        accessorKey: "absent",
        header: "Absent",
        Cell: ({ cell }) => (
          <span className="font-semibold text-red-400">{cell.getValue()}</span>
        ),
      },
      {
        accessorKey: "totalPresent",
        header: "Total",
        Cell: ({ cell }) => (
          <span className="font-semibold text-nero-100">
            {cell.getValue()}
          </span>
        ),
      },
      {
        accessorKey: "attendancePct",
        header: "Attendance %",
        Cell: ({ cell }) => {
          const pct = cell.getValue();
          const cls = getAttendanceBadge(pct);

          return (
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}
            >
              {pct}%
            </span>
          );
        },
      },
    ],
    []
  );

  const avgAttendance =
    tableData.length > 0
      ? (
        tableData.reduce((a, b) => a + Number(b.attendancePct), 0) /
        tableData.length
      ).toFixed(1)
      : "0.0";

  return (
    <>
      {/* Inject MonthPicker Styles */}
      <style>{monthPickerStyles}</style>

      <div className="w-full h-full flex flex-col gap-3">

        {/* Top Bar */}
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-2 bg-nero-800 border border-nero-700 rounded-md px-3 py-2" style={{ position: "relative", zIndex: 10 }}>

          {/* KPI (Moved to Left) */}
          <div className="flex gap-4 text-sm text-nero-400">
            <span>Employees: {rows.length}</span>
            <span>Avg Attendance: {avgAttendance}%</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Loading indicator */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-sm text-nero-400">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </div>
            )}

            {/* Month Picker (Moved to Right) */}
            <div className="dark-monthpicker-wrapper relative">
              <DatePicker
                selected={selectedDate}
                onChange={(date) => setSelectedDate(date)}
                dateFormat="MMM yyyy"
                placeholderText="Select month"
                disabled={isGenerating}
                showMonthYearPicker
                maxDate={new Date()}
                minDate={new Date("2024-01-01")}
                popperClassName="dark-monthpicker-popper"
                popperPlacement="bottom-end"
                portalId="root"
                customInput={<CustomDateInput />}
              />
              <CalendarTodayIcon
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "49%", /* Adjusted from 49% to 50% for better vertical centering */
                  transform: "translateY(-50%)",
                  color: "#CBD5E1",
                  fontSize: "18px",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3 text-sm text-red-400 flex items-start gap-2">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="font-medium">Error</div>
              <div className="text-red-400/80">{error}</div>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 border border-nero-700 rounded-md overflow-hidden bg-[#0b0b0b] flex flex-col">
          {isGenerating ? (
            <div className="flex-1 flex flex-col items-center justify-center text-nero-400 gap-4">
              <svg className="animate-spin h-10 w-10 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div className="text-lg font-medium text-nero-300">Generating Report for {selectedDate?.toLocaleString("default", { month: "long", year: "numeric" })}</div>
              <div className="text-sm text-nero-500">Please wait while we fetch the attendance data</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-nero-500 text-sm">
              Generate a monthly report
            </div>
          ) : (
            <ThemeProvider theme={darkMuiTheme}>
              <CssBaseline />
              <MaterialReactTable
                columns={columns}
                data={tableData}
                layoutMode="grid"
                enableStickyHeader
                enableDensityToggle={false}
                enableColumnActions
                enableFullScreenToggle
                enableHiding
                enableSorting
                enableGlobalFilter
                initialState={{ density: "comfortable" }}
                enableRowSelection={false}
                enableColumnFilters={true}
                enableColumnOrdering={false}
                enableColumnResizing={false}
                enablePagination
                enableBottomToolbar
                enableTopToolbar

                muiTableContainerProps={{
                  className: "minimal-scrollbar",
                  sx: {
                    flex: 1,
                    overflow: "auto",
                  },
                }}

                muiTablePaperProps={{
                  sx: {
                    backgroundColor: "#0b0b0b",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                  },
                }}

                muiTableHeadCellProps={{
                  sx: {
                    backgroundColor: "#141414",
                    color: "#9ca3af",
                    fontSize: "14px",
                    fontWeight: 600,
                    borderBottom: "1px solid #262626",
                    borderTop: "1px solid #262626",
                    borderRight: "1px solid #262626",
                  },
                }}

                muiSearchTextFieldProps={{
                  placeholder: "Search employee…",
                  size: "small",
                  autoFocus: false,
                  sx: {
                    width: "250px",
                    "& input": {
                      fontSize: "12px",
                      padding: "6px 8px",
                    },
                  },
                }}

                muiTableBodyCellProps={{
                  sx: {
                    fontSize: "14px",
                    padding: "8px 10px",
                    borderBottom: "1px solid #262626",
                    borderRight: "1px solid #262626",
                  },
                }}

                muiTopToolbarProps={{
                  sx: {
                    minHeight: "52px",
                    "& .MuiToolbar-root": {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },

                    "& .MuiTextField-root": {
                      width: "250px",
                      minWidth: "250px",
                      maxWidth: "250px",
                    },
                    "& *": {
                      transition: "none !important",
                    },
                  },
                }}

                renderTopToolbarCustomActions={({ table }) => (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={exportExcel}
                      disabled={isExporting}
                      className="px-3 py-1.5 rounded-md bg-nero-700 hover:bg-nero-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isExporting && exportType === "excel" ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Exporting...
                        </>
                      ) : (
                        "Export Excel"
                      )}
                    </button>
                    <button
                      onClick={exportPDF}
                      disabled={isExporting}
                      className="px-3 py-1.5 rounded-md bg-nero-700 hover:bg-nero-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isExporting && exportType === "pdf" ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Exporting...
                        </>
                      ) : (
                        "Export PDF"
                      )}
                    </button>
                  </div>
                )}
              />
            </ThemeProvider>
          )}
        </div>
      </div>
      <SettingsDialog />
    </>
  );
}