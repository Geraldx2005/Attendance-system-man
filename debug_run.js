import { generateMonthlyReport } from './electron/backend/monthlyReport.js';
import { initDB } from './electron/backend/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Try to locate DB based on find_by_name result or default
process.env.USER_DATA_PATH = "C:\\Users\\Admin\\AppData\\Roaming\\attendance-system"; 

try {
    initDB();
    console.log("DB Initialized");
    const report = generateMonthlyReport("2026-02");
    console.log("Report Generated:", JSON.stringify(report, null, 2));
} catch (e) {
    console.error(e);
}
