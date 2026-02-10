const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Admin\\AppData\\Roaming\\attendance-system\\logs\\app-2026-02-08.log';

try {
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    // Get last 2000 characters to see recent errors/warnings
    console.log(content.slice(-2000));
  } else {
    console.log('Log file not found:', logPath);
  }
} catch (err) {
  console.error('Error reading log:', err);
}
