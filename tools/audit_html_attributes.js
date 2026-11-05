const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html') && !f.startsWith('Compiled_'));
let missingForCount = 0;
let duplicateIdCount = 0;
const allIds = new Map();

htmlFiles.forEach(f => {
  const content = fs.readFileSync(path.join(rootDir, f), 'utf8');
  const labelMatches = content.match(/<label(?![^>]*\b(?:htmlFor|for)\b)[^>]*>/gi) || [];
  missingForCount += labelMatches.length;

  const idMatches = content.match(/id=["'][^"']+["']/gi) || [];
  idMatches.forEach(m => {
    const id = m.slice(4, -1);
    if (!allIds.has(id)) allIds.set(id, []);
    allIds.get(id).push(f);
  });
});

const duplicateDetails = [];
allIds.forEach((files, id) => {
  if (files.length > 1) {
    duplicateIdCount++;
    duplicateDetails.push({ id, files: Array.from(new Set(files)) });
  }
});

console.log('=== KẾT QUẢ QUÉT THUỘC TÍNH FORM HTML (DEVTOOLS AUDIT) ===');
console.log('Số file HTML thành phần đã quét:', htmlFiles.length);
console.log('Cảnh báo <label> không có htmlFor/for (Accessibility Warning):', missingForCount);
console.log('Tổng số id HTML độc nhất:', allIds.size);
console.log('Số id bị trùng lặp giữa các template file:', duplicateIdCount);
if (duplicateDetails.length > 0) {
  console.log('\nTop các id trùng lặp tiêu biểu:');
  duplicateDetails.slice(0, 10).forEach(d => {
    console.log(`  - id="${d.id}" xuất hiện ở: ${d.files.join(', ')}`);
  });
}
