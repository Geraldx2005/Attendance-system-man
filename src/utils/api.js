/**
 * API Utility for Electron IPC
 *
 * This wrapper provides a fetch-like interface for IPC communication.
 * IPC handlers already return Promises, so we just need to wrap them
 * in a Response-like object.
 */

/**
 * Main apiFetch function - mimics fetch() but uses Electron IPC
 * @param {string} path - API path (e.g., "/api/employees")
 * @param {Object} options - Fetch options (method, body, etc.)
 * @returns {Promise} - Promise that resolves to a Response-like object
 */
export async function apiFetch(path, options = {}) {
  try {
    // Parse URL
    const url = new URL(path, "http://localhost");
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const searchParams = Object.fromEntries(url.searchParams);

    let dataPromise;

    // Route to appropriate IPC handler
    if (pathSegments[0] === "api") {
      // GET /api/employees
      if (pathSegments[1] === "employees" && pathSegments.length === 2 && !options.method) {
        dataPromise = window.api.getEmployees();
      }
      // POST /api/employees/:id (update employee name)
      else if (pathSegments[1] === "employees" && pathSegments.length === 3 && options.method === "POST") {
        const employeeId = pathSegments[2];
        const body = options.body ? JSON.parse(options.body) : {};
        dataPromise = window.api.updateEmployee(employeeId, body.name, body.inTime);
      }
      // GET /api/logs/:employeeId
      else if (pathSegments[1] === "logs" && pathSegments.length === 3) {
        const employeeId = pathSegments[2];
        dataPromise = window.api.getLogs(employeeId, searchParams);
      }
      // GET /api/attendance/:employeeId
      else if (pathSegments[1] === "attendance" && pathSegments.length === 3) {
        const employeeId = pathSegments[2];
        const month = searchParams.month || null;
        dataPromise = window.api.getAttendance(employeeId, month);
      }
      // GET /api/monthly-report (OPTIMIZED)
      else if (pathSegments[1] === "monthly-report" && pathSegments.length === 2) {
        const month = searchParams.month;
        dataPromise = window.api.getMonthlyReport(month);
      }
      // GET /api/monthly-grid-report
      else if (pathSegments[1] === "monthly-grid-report" && pathSegments.length === 2) {
        const month = searchParams.month;
        dataPromise = window.api.getMonthlyGridReport(month);
      } else {
        throw new Error(`Unknown API endpoint: ${path}`);
      }
    } else {
      throw new Error(`Invalid API path: ${path}`);
    }

    // Wait for the IPC call to complete
    const data = await dataPromise;

    // Return a Response-like object
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  } catch (error) {
    console.error("apiFetch error:", error);

    // Return an error Response-like object
    return {
      ok: false,
      status: 500,
      statusText: error.message || "Internal Server Error",
      json: async () => {
        throw error;
      },
      text: async () => {
        throw error;
      },
    };
  }
}

// Direct API functions (optional - for cleaner code)
export async function getEmployees() {
  return window.api.getEmployees();
}

export async function getLogs(employeeId, params = {}) {
  return window.api.getLogs(employeeId, params);
}

export async function getAttendance(employeeId, month) {
  return window.api.getAttendance(employeeId, month);
}

export async function updateEmployee(employeeId, name, inTime) {
  return window.api.updateEmployee(employeeId, name, inTime);
}

export async function getMonthlyGridReport(month) {
  return window.api.getMonthlyGridReport(month);
}
