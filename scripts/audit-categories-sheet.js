/**
 * Deep-dive the Categories sheet vs DB categories.
 * Usage: node scripts/audit-categories-sheet.js "<xlsx>"
 */
require('dotenv').config();
const ExcelJS = require('exceljs');
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');

function cellText(row, col) {
  if (!col) return '';
  const v = row.getCell(col)?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.text) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    return String(v).trim();
  }
  return String(v).trim();
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const ws = wb.getWorksheet('Categories');
  const h = new Map();
  ws.getRow(1).eachCell((cell, col) => h.set(String(cell.value || '').trim(), col));
  const mainCol = h.get('Category');
  const subCol = h.get('Sub Category');
  const prodCol = h.get('Products');
  const codeCol = h.get('Hierarchy Code');

  await connectDB();
  const dbCats = await Category.find({}).select('name level hierarchyCodes parentId isActive').lean();
  const codeSet = new Set(dbCats.flatMap((c) => c.hierarchyCodes || []));
  const nameSetByLevel = { 1: new Set(), 2: new Set(), 3: new Set() };
  for (const c of dbCats) nameSetByLevel[c.level]?.add(c.name.trim().toLowerCase());

  const SKIP = new Set(['Alphanumeric', 'Free Text', 'Numeric', 'Mandatory', 'Optional', 'Prefilled', 'Dropdown']);
  let lastMain = '';
  let lastSub = '';
  const missingLeaves = [];
  let leafRows = 0;
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const m = cellText(row, mainCol);
    const s = cellText(row, subCol);
    const p = cellText(row, prodCol);
    const code = cellText(row, codeCol);
    if (m && !SKIP.has(m)) lastMain = m;
    if (s && !SKIP.has(s)) lastSub = s;
    if (!p || SKIP.has(p)) continue;
    leafRows += 1;
    const codeNorm = code.replace(/\s+/g, '');
    const inDbByCode = code && (codeSet.has(code) || codeSet.has(codeNorm));
    const inDbByName = nameSetByLevel[3].has(p.trim().toLowerCase());
    if (!inDbByCode && !inDbByName) {
      missingLeaves.push({ row: r, main: lastMain, sub: lastSub, product: p, code });
    }
  }
  console.log('Leaf rows in sheet:', leafRows);
  console.log('DB L3 count:', dbCats.filter((c) => c.level === 3).length);
  console.log('Leaves in sheet missing from DB (by code AND name):', missingLeaves.length);
  for (const x of missingLeaves) console.log(` row ${x.row}: [${x.main} > ${x.sub}] "${x.product}" code="${x.code}"`);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
