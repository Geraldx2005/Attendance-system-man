import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import { ingestSingleFile } from './ingest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup temp env
const tempDir = path.join(__dirname, 'temp_test_env');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}
process.env.USER_DATA_PATH = tempDir;

// Initialize DB
console.log("Initializing DB...");
const db = initDB();

// Create dummy CSV
const csvContent = `Employee Code,AttendanceDate,PunchRecords,Employee Name
EMP001,2023-10-27,"09:00, 18:00",Should Be Ignored
EMP001,2023-10-28,09:30; 18:30,Should Be Ignored
EMP002,2023-10-27,10:00,Ignored Name
`;

const csvPath = path.join(tempDir, 'test.csv');
fs.writeFileSync(csvPath, csvContent);

// Run ingest
console.log("Running ingestion...");
try {
    await ingestSingleFile(csvPath, (p) => console.log(`Progress: ${p.progress}% - ${p.message}`));
    
    // Check results
    console.log("Checking Employees...");
    const employees = db.prepare("SELECT * FROM employees").all();
    console.table(employees);
    
    console.log("Checking Logs...");
    const logs = db.prepare("SELECT * FROM attendance_logs").all();
    console.table(logs);
    
    // Clean up
    // db.close(); // better-sqlite3 handles this, but explicit close might be needed if deleting file immediately
    
} catch (err) {
    console.error("Test failed:", err);
}
