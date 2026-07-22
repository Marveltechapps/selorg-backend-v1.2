/** Dump Categories sheet rows whose code or product matches a pattern, plus DB L3 names matching. */
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

  console.log('Rows with code matching 3[567]xx or product matching flour/noodle/pasta/pine/moringa:');
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const m = cellText(row, h.get('Category'));
    const s = cellText(row, h.get('Sub Category'));
    const p = cellText(row, h.get('Products'));
    const code = cellText(row, h.get('Hierarchy Code'));
    const codeN = code.replace(/\s+/g, '');
    if (/^A3[567]\d\d$/.test(codeN) || /flour|noodle|pasta|pine|moringa/i.test(p) || /flour|noodle|pasta/i.test(s)) {
      console.log(` r${r}: main="${m}" sub="${s}" product="${p}" code="${code}"`);
    }
  }

  await connectDB();
  const l3 = await Category.find({ level: 3, name: { $regex: /flour|noodle|pasta|pine|moringa/i } })
    .select('name hierarchyCodes parentId isActive')
    .lean();
  console.log('\nDB L3 matching flour/noodle/pasta/pine/moringa:', l3.length);
  const parents = await Category.find({ _id: { $in: l3.map((c) => c.parentId) } }).select('name parentId').lean();
  const pById = new Map(parents.map((p) => [String(p._id), p]));
  for (const c of l3) console.log(' ', c.name, JSON.stringify(c.hierarchyCodes), 'parent=' + (pById.get(String(c.parentId))?.name || '?'), 'active=' + c.isActive);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
