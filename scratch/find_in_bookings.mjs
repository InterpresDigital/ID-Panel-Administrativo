import fs from 'fs';

const content = fs.readFileSync('pages/Bookings.tsx', 'utf8');
const lines = content.split('\n');

console.log("Searching for clientId or clientSecret in Bookings.tsx...");
lines.forEach((line, index) => {
  if (line.includes('clientId') || line.includes('clientSecret') || line.includes('googleConfig')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
