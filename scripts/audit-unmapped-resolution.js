/**
 * For every product without categoryId, propose a resolution:
 *  - sheet leaf row with same hierarchy code (normalized)
 *  - or DB L3 category whose name is a prefix of the product name
 * Usage: node scripts/audit-unmapped-resolution.js "<xlsx>"
 */
require('dotenv').config();
const ExcelJS = require('exceljs');
const connectDB = require('../src/config/db');
const { Category } = require('../src/customer-backend/models/Category');
const { Product } = require('../src/customer-backend/models/Product');

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

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const ws = wb.getWorksheet('Categories');
  const h = new Map();
  ws.getRow(1).eachCell((cell, col) => h.set(String(cell.value || '').trim(), col));

  // Build sheet leaf index: normalized code -> {main, sub, product}
  const SKIP = new Set(['Alphanumeric', 'Free Text', 'Numeric', 'Mandatory', 'Optional', 'Prefilled', 'Dropdown']);
  let lastMain = '';
  let lastSub = '';
  const leafByCode = new Map();
  const leafByName = new Map();
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const m = cellText(row, h.get('Category'));
    const s = cellText(row, h.get('Sub Category'));
    const p = cellText(row, h.get('Products'));
    const code = cellText(row, h.get('Hierarchy Code'));
    if (m && !SKIP.has(m)) lastMain = m;
    if (s && !SKIP.has(s)) lastSub = s;
    if (!p || SKIP.has(p)) continue;
    const entry = { row: r, main: lastMain, sub: lastSub, product: p, code };
    if (code) leafByCode.set(code.replace(/\s+/g, '').toUpperCase(), entry);
    leafByName.set(norm(p), entry);
  }

  await connectDB();
  const cats = await Category.find({}).select('name level parentId hierarchyCodes isActive slug').lean();
  const catById = new Map(cats.map((c) => [String(c._id), c]));
  const l3ByNorm = new Map();
  for (const c of cats.filter((c) => c.level === 3)) l3ByNorm.set(norm(c.name), c);
  const l2ByNorm = new Map();
  for (const c of cats.filter((c) => c.level === 2)) l2ByNorm.set(norm(c.name), c);

  const unmapped = await Product.find({ $or: [{ categoryId: null }, { categoryId: { $exists: false } }] })
    .select('sku name classification hierarchyCode')
    .lean();

  console.log('UNMAPPED PRODUCTS:', unmapped.length);
  for (const p of unmapped) {
    const codeNorm = String(p.hierarchyCode || '').replace(/\s+/g, '').toUpperCase();
    const sheetLeaf = leafByCode.get(codeNorm);
    // name prefix match against L3 categories
    const pn = norm(p.name);
    let nameMatch = null;
    for (const [k, c] of l3ByNorm) {
      if (k && (pn === k || pn.startsWith(k + ' '))) {
        if (!nameMatch || k.length > norm(nameMatch.name).length) nameMatch = c;
      }
    }
    // If sheet leaf exists, can we find its sub/main in DB?
    let sheetPath = null;
    if (sheetLeaf) {
      const sub = l2ByNorm.get(norm(sheetLeaf.sub));
      sheetPath = `${sheetLeaf.main} > ${sheetLeaf.sub} > ${sheetLeaf.product} | L2 in DB: ${sub ? sub.name : 'NO'}`;
    }
    let nm = null;
    if (nameMatch) {
      const sub = catById.get(String(nameMatch.parentId));
      const main = sub ? catById.get(String(sub.parentId)) : null;
      nm = `${main?.name || '?'} > ${sub?.name || '?'} > ${nameMatch.name}`;
    }
    console.log(
      `${p.sku} | ${p.classification} | "${p.name}" | code=${p.hierarchyCode}`,
      `\n    sheetLeaf: ${sheetPath || 'none'}`,
      `\n    dbL3NameMatch: ${nm || 'none'}`
    );
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
