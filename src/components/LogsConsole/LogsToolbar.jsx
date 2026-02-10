import { memo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  IoCalendarOutline,
  IoLogInOutline,
  IoLogOutOutline,
  IoFunnelOutline,
  IoTimeOutline,
} from "react-icons/io5";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday"; // Helper Icon

// Custom Dark Theme CSS for React-Datepicker (Copied from DailyReport.jsx)
const datePickerStyles = `
.dark-datepicker-wrapper {
    position: relative;
    z-index: 9999;
}

.dark-datepicker-wrapper .react-datepicker-wrapper {
    width: 160px;
}

.dark-datepicker-wrapper .react-datepicker__input-container {
    width: 100%;
}

.dark-datepicker-wrapper .react-datepicker__input-container .react-datepicker-custom-input {
    background-color: rgba(27, 27, 27, 0.8);
    border: 2px solid transparent;
    border-radius: 8px;
    color: #d1d1d1;
    padding: 6px 12px 6px 12px; /* Top, Right, Bottom, Left */
    padding-right: 30px; /* Make space for icon */
    font-size: 14px;
    width: 160px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.dark-datepicker-wrapper .react-datepicker__input-container .react-datepicker-custom-input:hover {
    border-color: rgba(16, 185, 129, 0.5);
    border-width: 2px;
}

.dark-datepicker-wrapper .react-datepicker__input-container .react-datepicker-custom-input:focus {
    outline: none;
    border-color: rgba(16, 185, 129, 0.8);
}

.dark-datepicker-wrapper .react-datepicker__input-container .react-datepicker-custom-input::placeholder {
    color: #CBD5E1;
}

.dark-datepicker-popper {
    z-index: 9999 !important;
}

.dark-datepicker-popper .react-datepicker {
    background-color: #141414;
    border: 1px solid #262626;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    font-family: inherit;
    overflow: hidden;
}

.dark-datepicker-popper .react-datepicker__header {
    background-color: #1a1a1a;
    border-bottom: 1px solid #262626;
    padding: 12px;
}

.dark-datepicker-popper .react-datepicker__current-month {
    color: #d1d1d1;
    font-size: 15px;
    font-weight: 600;
}

.dark-datepicker-popper .react-datepicker__day-names {
    display: flex;
    justify-content: space-around;
    margin-top: 4px;
}

.dark-datepicker-popper .react-datepicker__day-name {
    color: #6b7280;
    font-size: 12px;
    font-weight: 500;
    width: 36px;
    text-transform: uppercase;
}

.dark-datepicker-popper .react-datepicker__month {
    padding: 8px;
    margin: 0;
}

.dark-datepicker-popper .react-datepicker__week {
    display: flex;
    justify-content: space-around;
}

.dark-datepicker-popper .react-datepicker__day {
    color: #d1d1d1;
    font-size: 13px;
    width: 36px;
    height: 36px;
    line-height: 36px;
    margin: 2px;
    border-radius: 8px;
    transition: all 0.15s ease;
}

.dark-datepicker-popper .react-datepicker__day:hover {
    background-color: #262626;
    color: #fff;
}


/* Selected - only explicit user selection */
.dark-datepicker-popper .react-datepicker__day--selected {
    background-color: #10b981 !important;
    color: #000 !important;
    font-weight: 600;
}

/* Keyboard-selected (auto-focus on open) - should NOT be highlighted */
.dark-datepicker-popper .react-datepicker__day--keyboard-selected:not(.react-datepicker__day--selected) {
    background-color: transparent !important;
    color: #d1d1d1 !important;
    font-weight: normal;
}




.dark-datepicker-popper .react-datepicker__day--outside-month {
    color: #4b5563;
}

.dark-datepicker-popper .react-datepicker__day--disabled {

    color: #838E9A !important;

    cursor: not-allowed;

}



/* Suppress default highlight for today's day */

.dark-datepicker-popper .react-datepicker__day--today {

    background-color: transparent;

}



.dark-datepicker-popper .react-datepicker__navigation {

    top: 12px;

}

.dark-datepicker-popper .react-datepicker__navigation-icon::before {
    border-color: #9ca3af;
}

.dark-datepicker-popper .react-datepicker__navigation:hover .react-datepicker__navigation-icon::before {
    border-color: #10b981;
}

.dark-datepicker-popper .react-datepicker__triangle {
    display: none;
}

.dark-datepicker-popper .react-datepicker__month-dropdown-container,
.dark-datepicker-popper .react-datepicker__year-dropdown-container {
    margin: 0 4px;
}

.dark-datepicker-popper .react-datepicker__month-select,
.dark-datepicker-popper .react-datepicker__year-select {
    background: linear-gradient(135deg, #1a1a1a 0%, #262626 100%);
    border: 1px solid #374151;
    border-radius: 8px;
    color: #d1d1d1;
    padding: 6px 28px 6px 32px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.dark-datepicker-popper .react-datepicker__month-select:hover,
.dark-datepicker-popper .react-datepicker__year-select:hover {
    background: linear-gradient(135deg, #262626 0%, #2d2d2d 100%);
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15), 0 4px 8px rgba(0, 0, 0, 0.4);
    transform: translateY(-1px);
}

.dark-datepicker-popper .react-datepicker__month-select:focus,
.dark-datepicker-popper .react-datepicker__year-select:focus {
    outline: none;
    border-color: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25), 0 4px 12px rgba(16, 185, 129, 0.2);
    background: linear-gradient(135deg, #1f2937 0%, #2d2d2d 100%);
}

.dark-datepicker-popper .react-datepicker__month-select:active,
.dark-datepicker-popper .react-datepicker__year-select:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Dropdown Options Styling */
.dark-datepicker-popper .react-datepicker__month-select option,
.dark-datepicker-popper .react-datepicker__year-select option {
    background-color: #1a1a1a;
    color: #d1d1d1;
    padding: 8px;
    font-weight: 500;
}

.dark-datepicker-popper .react-datepicker__month-select option:hover,
.dark-datepicker-popper .react-datepicker__year-select option:hover {
    background-color: #10b981;
    color: #000;
}
`;

// Exact match from DailyReport.jsx
const CustomDateInput = ({ value, onClick }) => (
  <input
    type="text"
    className="react-datepicker-custom-input"
    onClick={onClick}
    value={value}
    readOnly={true}
    placeholder="Select date"
  />
);

function LogsToolbar({
  selectedDate,
  onDateChange,
  typeFilter,
  onTypeChange,
  summaryMode,
  onSummaryClick,
  duration,
  isLoading = false,
}) {
  const tabBtn =
    "px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-colors font-medium";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-nero-800/90 backdrop-blur border border-nero-700 rounded-md flex-wrap">

      {/* Inject DatePicker Styles */}
      <style>{datePickerStyles}</style>

      {/* Date Picker (Exact match) */}
      <div className="dark-datepicker-wrapper relative">
        <DatePicker
          selected={selectedDate} // Maps to 'selected={selectedDate || undefined}' logic in usage if needed, but here simple passing is fine
          onChange={(date) => onDateChange(date)}
          dateFormat="dd MMM yyyy"
          placeholderText="Select date"
          disabled={isLoading}
          dropdownMode="select" // Added
          yearDropdownItemNumber={15} // Added to support dropdown
          scrollableYearDropdown // Added to support dropdown
          maxDate={new Date()}
          minDate={new Date("2024-01-01")}
          popperClassName="dark-datepicker-popper"
          popperPlacement="bottom-start" // DailyReport uses bottom-end but bottom-start might be better here as it's left aligned. DailyReport was bottom-end because it was on the right side. Let's stick to bottom-start for toolbar logic or match exactly? User said "ditto copy". But placement depends on position. I'll use bottom-start as it's the first item on the left.
          portalId="root"
          customInput={<CustomDateInput />}
        />
        <CalendarTodayIcon
          style={{
            position: "absolute",
            right: "10px",
            top: "49%",
            transform: "translateY(-50%)",
            color: "#CBD5E1",
            fontSize: "18px",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-nero-700" />

      {/* Type Filter */}
      <div className="flex items-center gap-1 bg-nero-900/80 p-1 rounded-md">
        <button
          onClick={() => onTypeChange("all")}
          disabled={isLoading}
          className={`${tabBtn} ${typeFilter === "all" && !summaryMode
            ? "bg-nero-700 text-nero-200"
            : "text-nero-500 hover:bg-nero-800"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <IoFunnelOutline className="text-sm" />
          All
        </button>

        <button
          onClick={() => onTypeChange("in")}
          disabled={isLoading}
          className={`${tabBtn} ${typeFilter === "in" && !summaryMode
            ? "bg-nero-700 text-emerald-400"
            : "text-nero-500 hover:bg-nero-800"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <IoLogInOutline className="text-sm" />
          In
        </button>

        <button
          onClick={() => onTypeChange("out")}
          disabled={isLoading}
          className={`${tabBtn} ${typeFilter === "out" && !summaryMode
            ? "bg-nero-700 text-red-400"
            : "text-nero-500 hover:bg-nero-800"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <IoLogOutOutline className="text-sm" />
          Out
        </button>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-nero-700" />

      {/* Day Summary */}
      <div className="flex items-center gap-2 bg-nero-900/80 p-1 rounded-md">
        <button
          onClick={onSummaryClick}
          disabled={isLoading}
          className={`${tabBtn} ${summaryMode
            ? "bg-nero-700 text-nero-200"
            : "text-nero-500 hover:bg-nero-800"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <IoTimeOutline className="text-sm" />
          Day Summary
        </button>

        {summaryMode && duration && (
          <div className="px-2.5 py-1.5 text-xs font-medium text-nero-300 bg-nero-800 rounded-md">
            {duration}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-nero-400">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading...</span>
        </div>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent re-renders
export default memo(LogsToolbar);