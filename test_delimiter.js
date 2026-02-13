
const currentRegex = /[,;\n|]+/;
const proposedRegex = /[,;\n|\s]+/;

const samples = [
  "09:00, 18:00",       // Comma + space
  "09:00;18:00",        // Semicolon
  "09:00 18:00",        // Space
  "09:00\n18:00",       // Newline
  "09:00|18:00",        // Pipe
  "09:00   18:00",      // Multiple spaces
  "09:00,  18:00"       // Comma + multiple spaces
];

console.log("Testing Current Regex:", currentRegex);
samples.forEach(s => {
    const split = s.split(currentRegex).filter(t => t.trim());
    console.log(`'${s}' ->`, split);
});

console.log("\nTesting Proposed Regex:", proposedRegex);
samples.forEach(s => {
    const split = s.split(proposedRegex).filter(t => t.trim());
    console.log(`'${s}' ->`, split);
});
