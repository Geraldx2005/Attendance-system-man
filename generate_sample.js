const fs = require('fs');
const path = require('path');

try {
  const filePath = path.join(__dirname, 'sample_data_200.csv');
  console.log('Generating file at:', filePath);

  const headers = 'EmployeeID,EmployeeName,Date,Time';
  let content = headers + '\n';

  // Generate 200 unique records
  for (let i = 1; i <= 200; i++) {
    const id = `EMP${String(i).padStart(3, '0')}`;
    const name = `Test Employee ${i}`;
    const date = '2026-02-08';
    
    // Random time between 09:00:00 and 18:00:00
    const hour = 9 + Math.floor(Math.random() * 9);
    const min = Math.floor(Math.random() * 60);
    const sec = Math.floor(Math.random() * 60);
    const time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    
    content += `${id},${name},${date},${time}\n`;
  }

  fs.writeFileSync(filePath, content);
  console.log(`Successfully generated ${filePath}`);
  process.exit(0);
} catch (err) {
  console.error('Failed to generate CSV:', err);
  process.exit(1);
}
