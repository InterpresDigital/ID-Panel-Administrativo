import { jsPDF } from 'jspdf';

const doc = new jsPDF();
doc.setFont("helvetica", "normal");
doc.setFontSize(9.5);

const line = "- cuentas de **INTERPRES DIGITAL**;";
const parts = line.split('**');

console.log("Parts:", parts);

const margin = 20;
let currentX = margin;
let inBold = false;

parts.forEach((part, index) => {
  if (index > 0) {
    inBold = !inBold;
  }
  doc.setFont("helvetica", inBold ? 'bold' : 'normal');
  doc.setFontSize(9.5);
  
  const spaceWidth = Math.max(0.1, doc.getTextWidth("a a") - doc.getTextWidth("aa"));
  const trimmed = part.trim();
  
  if (!trimmed) {
    const w = part.length * spaceWidth;
    console.log(`Part ${index} ("${part}"): empty, width advanced by ${w}`);
    currentX += w;
    return;
  }
  
  const leadingSpaces = part.length - part.trimStart().length;
  const trailingSpaces = part.length - part.trimEnd().length;
  
  let trimmedWidth = 0;
  const words = trimmed.split(' ');
  words.forEach((word, idx) => {
    if (word) {
      trimmedWidth += doc.getTextWidth(word);
    }
    if (idx < words.length - 1) {
      trimmedWidth += spaceWidth;
    }
  });
  
  const originalX = currentX;
  currentX += leadingSpaces * spaceWidth;
  const startDrawX = currentX;
  currentX += trimmedWidth + (trailingSpaces * spaceWidth);
  if (index < parts.length - 1) {
    currentX += 0.6;
  }
  
  console.log(`Part ${index} ("${part}"):`);
  console.log(`  Trimmed: "${trimmed}"`);
  console.log(`  Leading spaces: ${leadingSpaces}, Trailing: ${trailingSpaces}`);
  console.log(`  Trimmed width: ${trimmedWidth}`);
  console.log(`  Start Draw X: ${startDrawX}`);
  console.log(`  End X: ${currentX} (delta: ${currentX - originalX})`);
});
