import { useState, useMemo } from "react";
import { MaterialReactTable } from "material-react-table";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiFetch } from "../utils/api";

// Dark MUI Theme (same as Reports.jsx)
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

// Helper: Format minutes to "Xh Ym"
function formatMinutes(mins) {
    if (!mins || mins <= 0) return "0h 0m";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

// Helper: Convert HH:MM to 12-hour format
function to12Hour(time) {
    if (!time) return "--";
    const [h, m] = time.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

// Helper: Convert HH:MM to minutes
function timeToMinutes(time) {
    if (!time) return null;
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

// Fetch Daily Report
async function fetchDailyReport(date) {
    // Fetch all employees
    const empRes = await apiFetch("/api/employees");
    const employees = await empRes.json();

    const result = [];

    // Fetch logs for each employee for the selected date
    for (const emp of employees) {
        const logsRes = await apiFetch(`/api/logs/${emp.employeeId}?date=${date}`);
        const logs = await logsRes.json();

        // Calculate stats
        const punches = logs.map(l => l.time).sort();

        let firstIn = null;
        let lastOut = null;
        let workingMins = 0;
        let breakMins = 0;
        let status = "Absent";

        if (punches.length > 0) {
            firstIn = punches[0];
            lastOut = punches[punches.length - 1];

            const inMin = timeToMinutes(firstIn);
            const outMin = timeToMinutes(lastOut);

            if (inMin !== null && outMin !== null && outMin > inMin) {
                const totalMins = outMin - inMin;

                // Calculate breaks (gaps between consecutive punches)
                for (let i = 1; i < punches.length - 1; i += 2) {
                    const outTime = timeToMinutes(punches[i]);
                    const inTime = timeToMinutes(punches[i + 1]);
                    if (outTime && inTime && inTime > outTime) {
                        breakMins += inTime - outTime;
                    }
                }

                workingMins = totalMins - breakMins;

                // Determine status
                if (workingMins >= 8 * 60) status = "Present";
                else if (workingMins >= 5 * 60) status = "Half Day";
                else if (workingMins > 0) status = "Short Day";
            }
        }

        result.push({
            employeeId: emp.employeeId,
            employeeName: emp.name,
            firstIn,
            lastOut,
            workingMins,
            breakMins,
            punchCount: punches.length,
            status,
        });
    }

    return result;
}

// Get status badge class
function getStatusBadge(status) {
    switch (status) {
        case "Present":
            return "bg-emerald-500/15 text-emerald-400";
        case "Half Day":
            return "bg-amber-500/15 text-amber-400";
        case "Short Day":
            return "bg-orange-500/15 text-orange-400";
        case "Absent":
            return "bg-red-500/15 text-red-400";
        default:
            return "bg-nero-500/15 text-nero-400";
    }
}

// Component
export default function DailyReport({ onGenerated }) {
    const [rows, setRows] = useState([]);
    const [selectedDate, setSelectedDate] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportType, setExportType] = useState("");
    const [error, setError] = useState(null);

    const generateReport = async () => {
        try {
            if (!selectedDate) {
                setError("Please select a date");
                return;
            }

            setError(null);
            setIsGenerating(true);

            const data = await fetchDailyReport(selectedDate);
            setRows(data);

            // Parse date for display
            const dateObj = new Date(selectedDate);
            onGenerated?.(dateObj.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
            }));
        } catch (err) {
            console.error("Daily report failed", err);
            setError("Failed to generate report. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const exportExcel = async () => {
        try {
            setIsExporting(true);
            setExportType("excel");

            await new Promise(resolve => setTimeout(resolve, 100));

            const data = tableData.map(r => ({
                "Employee ID": r.employeeId,
                "Employee Name": r.employeeName,
                "First In": r.firstIn ? to12Hour(r.firstIn) : "--",
                "Last Out": r.lastOut ? to12Hour(r.lastOut) : "--",
                "Working Hours": formatMinutes(r.workingMins),
                "Break Hours": formatMinutes(r.breakMins),
                "Punches": r.punchCount,
                "Status": r.status,
            }));

            const ws = XLSX.utils.json_to_sheet(data);

            ws["!cols"] = [
                { wch: 14 },
                { wch: 22 },
                { wch: 12 },
                { wch: 12 },
                { wch: 14 },
                { wch: 12 },
                { wch: 10 },
                { wch: 12 },
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Daily Attendance");

            XLSX.writeFile(wb, `Daily Attendance Report ${selectedDate}.xlsx`);
            setError(null);
        } catch (err) {
            console.error("Excel export failed", err);
            setError("Failed to export Excel file.");
        } finally {
            setIsExporting(false);
            setExportType("");
        }
    };

    const exportPDF = async () => {
        try {
            setIsExporting(true);
            setExportType("pdf");

            await new Promise(resolve => setTimeout(resolve, 100));

            const doc = new jsPDF({
                orientation: "landscape",
                unit: "pt",
                format: "a4",
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            const COLORS = {
                text: "#000000",
                muted: "#4b5563",
                border: "#000000",
                headerBg: "#f2f2f2",
                rowAlt: "#fafafa",
            };

            // Header
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(COLORS.text);
            doc.text("Daily Attendance Report", 36, 28);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(COLORS.muted);
            doc.text(`Date: ${selectedDate}`, pageWidth - 36, 28, { align: "right" });

            doc.setDrawColor(COLORS.border);
            doc.setLineWidth(0.8);
            doc.line(36, 36, pageWidth - 36, 36);

            // Table
            autoTable(doc, {
                startY: 44,
                margin: { left: 36, right: 36 },

                head: [[
                    "Employee ID",
                    "Employee Name",
                    "First In",
                    "Last Out",
                    "Working Hours",
                    "Break Hours",
                    "Punches",
                    "Status",
                ]],

                body: tableData.map(r => [
                    r.employeeId,
                    r.employeeName,
                    r.firstIn ? to12Hour(r.firstIn) : "--",
                    r.lastOut ? to12Hour(r.lastOut) : "--",
                    formatMinutes(r.workingMins),
                    formatMinutes(r.breakMins),
                    r.punchCount,
                    r.status,
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
                    0: { halign: "center", cellWidth: 70 },
                    1: { halign: "left", cellWidth: 150 },
                    2: { halign: "center", cellWidth: 70 },
                    3: { halign: "center", cellWidth: 70 },
                    4: { halign: "center", cellWidth: 80 },
                    5: { halign: "center", cellWidth: 70 },
                    6: { halign: "center", cellWidth: 55 },
                    7: { halign: "center", cellWidth: 70 },
                },

                alternateRowStyles: {
                    fillColor: COLORS.rowAlt,
                },
            });

            // Footer
            const now = new Date();
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(COLORS.muted);
            doc.text(
                `Generated on: ${now.toLocaleString()}`,
                pageWidth - 20,
                pageHeight - 22,
                { align: "right" }
            );

            doc.save(`Daily Attendance Report ${selectedDate}.pdf`);
            setError(null);
        } catch (err) {
            console.error("PDF export failed", err);
            setError("Failed to export PDF file.");
        } finally {
            setIsExporting(false);
            setExportType("");
        }
    };

    // Table Data
    const tableData = useMemo(() => {
        return rows.map((r, idx) => ({
            ...r,
            employeeId: r.employeeId.startsWith("EMP")
                ? r.employeeId
                : `EMP${String(idx + 1).padStart(3, "0")}`,
        }));
    }, [rows]);

    // Columns
    const columns = useMemo(
        () => [
            { accessorKey: "employeeId", header: "ID", size: 100 },
            { accessorKey: "employeeName", header: "Employee", size: 200 },
            {
                accessorKey: "firstIn",
                header: "First In",
                size: 100,
                Cell: ({ cell }) => (
                    <span className="text-emerald-400 font-medium">
                        {cell.getValue() ? to12Hour(cell.getValue()) : "--"}
                    </span>
                ),
            },
            {
                accessorKey: "lastOut",
                header: "Last Out",
                size: 100,
                Cell: ({ cell }) => (
                    <span className="text-red-400 font-medium">
                        {cell.getValue() ? to12Hour(cell.getValue()) : "--"}
                    </span>
                ),
            },
            {
                accessorKey: "workingMins",
                header: "Working",
                size: 100,
                Cell: ({ cell }) => (
                    <span className="text-blue-400 font-medium">
                        {formatMinutes(cell.getValue())}
                    </span>
                ),
            },
            {
                accessorKey: "breakMins",
                header: "Breaks",
                size: 100,
                Cell: ({ cell }) => (
                    <span className="text-amber-400 font-medium">
                        {formatMinutes(cell.getValue())}
                    </span>
                ),
            },
            {
                accessorKey: "punchCount",
                header: "Punches",
                size: 80,
                Cell: ({ cell }) => (
                    <span className="text-nero-300">{cell.getValue()}</span>
                ),
            },
            {
                accessorKey: "status",
                header: "Status",
                size: 110,
                Cell: ({ cell }) => {
                    const status = cell.getValue();
                    const cls = getStatusBadge(status);
                    return (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>
                            {status}
                        </span>
                    );
                },
            },
        ],
        []
    );

    // Summary stats
    const stats = useMemo(() => {
        const present = tableData.filter(r => r.status === "Present").length;
        const halfDay = tableData.filter(r => r.status === "Half Day").length;
        const absent = tableData.filter(r => r.status === "Absent").length;
        return { present, halfDay, absent };
    }, [tableData]);

    return (
        <div className="w-full h-full flex flex-col gap-3">

            {/* Top Bar */}
            <div className="flex items-center gap-2 bg-nero-800 border border-nero-700 rounded-md px-3 py-2">

                {/* Date Picker */}
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    disabled={isGenerating}
                    className="appearance-none bg-nero-900 border border-nero-700 px-3 py-1.5 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                />

                {/* KPIs */}
                <div className="flex gap-4 text-sm text-nero-400 ml-3">
                    <span className="text-emerald-400">Present: {stats.present}</span>
                    <span className="text-amber-400">Half Day: {stats.halfDay}</span>
                    <span className="text-red-400">Absent: {stats.absent}</span>
                    <span className="text-nero-500">|</span>
                    <span>Total: {tableData.length}</span>
                </div>

                <button
                    onClick={generateReport}
                    disabled={isGenerating || !selectedDate}
                    className="ml-auto px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-emerald-600 flex items-center gap-2"
                >
                    {isGenerating ? (
                        <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating...
                        </>
                    ) : (
                        "Generate"
                    )}
                </button>
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
                        <div className="text-lg font-medium text-nero-300">Generating Report...</div>
                        <div className="text-sm text-nero-500">Please wait while we fetch the attendance data</div>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-nero-500 text-sm">
                        Select a date and generate a daily report
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

                            renderTopToolbarCustomActions={() => (
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
    );
}
