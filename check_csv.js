const fs = require('fs');
const path = require('path');

const csvPath = 'employee_attendance_feb_2026.csv'; // Relative path

console.log('Checking CSV file:', csvPath);

function timeToMinutes(time) {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

try {
    const data = fs.readFileSync(csvPath, 'utf8');
    const lines = data.split('\n').filter(l => l.trim());
    // remove header
    const headers = lines.shift();

    const punches = {};

    lines.forEach(line => {
        const [empId, name, date, time] = line.split(',');
        if (!empId || !date || !time) return;
        
        const key = `${empId}-${date}`;
        if (!punches[key]) punches[key] = [];
        punches[key].push(time.trim());
    });

    let counts = {
        'Absent': 0,
        'Half Day': 0,
        'Full Day': 0,
        'Extra': 0,
        'Holiday': 0
    };

    let halfDayEntries = [];

    Object.keys(punches).forEach(key => {
        const times = punches[key].sort();
        const first = times[0];
        const last = times[times.length - 1];
        
        const firstMin = timeToMinutes(first);
        const lastMin = timeToMinutes(last);
        const diff = lastMin - firstMin;
        const diffHours = diff / 60;
        
        const dateStr = key.split('-').slice(1).join('-'); // extract date part properly? No, key is ID-YYYY-MM-DD
        // Actually key is just a unique identifier for the day.
        // We need the date object to check for Sunday.
        const datePart = key.split('-').slice(1).join('-');
        
        // Wait, the key format depends on empId. If empId is "1", key is "1-2026-02-01".
        const parts = key.split('-');
        // empId is parts[0]. Date is parts.slice(1).join('-')
        const dateString = parts.slice(1).join('-');
        const dateObj = new Date(dateString);
        const isSunday = dateObj.getDay() === 0;

        let status = 'Absent';
        if (isSunday) {
             status = 'Extra';
        } else if (diff >= 8 * 60) {
            status = 'Full Day';
        } else if (diff >= 5 * 60) {
            status = 'Half Day';
            halfDayEntries.push({ key, first, last, diffHours });
        } else {
            status = 'Absent'; // < 5 hours
        }
        
        counts[status]++;
    });

    console.log('Status Counts based on CSV Data (first-in to last-out):');
    console.log(JSON.stringify(counts, null, 2));
    
    if (halfDayEntries.length > 0) {
        console.log('\nHalf Day Entries found:');
        console.log(halfDayEntries);
    } else {
         console.log('\nNo "Half Day" entries found in the data (between 5 and 8 hours).');
    }

} catch (err) {
    console.error('Error:', err);
}
