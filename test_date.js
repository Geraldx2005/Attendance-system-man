const month = "2026-02";
const [targetYear, targetMonth] = month.split("-").map(Number);
const day = 1;

// Method 1: String
const dateStr = `${month}-${String(day).padStart(2, "0")}`;
const dateObjStr = new Date(dateStr);
console.log(`String '${dateStr}':`, dateObjStr.toString(), "Day:", dateObjStr.getDay());

// Method 2: Constructor
const dateObjConst = new Date(targetYear, targetMonth - 1, day);
console.log(`Constructor (${targetYear}, ${targetMonth-1}, ${day}):`, dateObjConst.toString(), "Day:", dateObjConst.getDay());

// Check if Sunday (0)
console.log("String is Sunday?", dateObjStr.getDay() === 0);
console.log("Constructor is Sunday?", dateObjConst.getDay() === 0);
