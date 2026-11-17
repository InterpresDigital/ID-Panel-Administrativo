import fs from 'fs';

const content = fs.readFileSync('pages/Bookings.tsx', 'utf8');
const lines = content.split('\n');

console.log("Searching for Google Workspace UI elements in Bookings.tsx...");
lines.forEach((line, index) => {
  if (line.includes('Google Workspace') || line.includes('Vincular Cuenta de Google') || line.includes('Google Gmail API')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
