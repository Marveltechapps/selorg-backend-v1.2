/**
 * Compare Master Sheet workbook contents with the customer catalog DB.
 * Usage: node scripts/audit-mastersheet.js "<path-to-xlsx>"
 */
require('dotenv').config();
const ExcelJS = require('exceljs');
const connectDB = require('../src/config/db');
const { Product } = require('../src/customer-backend/models/Product');
const { Category } = require('../src/customer-backend/models/Category');

function cellText(row, col) {
  if (!col) return '';
  const cell = row.getCell(col);
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.text) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    if (v.hyperlink) return String(v.text || v.hyperlink).trim();
    return String(v).trim();
  }
  return String(v).trim();
}

(async () => {
  const file = process.argv[2];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  console.log('SHEETS:', wb.worksheets.map((w) => `${w.name} (${w.rowCount} rows)`).join(' | '));

  // --- SKU Master sheet ---
  const skuWs = wb.getWorksheet('SKU Master');
  const header = new Map();
  skuWs.getRow(1).eachCell((cell, col) => header.set(String(cell.value || '').trim(), col));
  const skuCol = header.get('SKU Code') || header.get('SKU code');
  const nameCol = header.get('SKU Name');
  const classCol = [...header.keys()].find((k) => k === 'SKU Classification');
  const hcCol = [...header.keys()].find((k) => k.toLowerCase().includes('hierarchy code'));
  const saleableCol = [...header.keys()].find((k) => k.toLowerCase().includes('is saleable'));

  const SKIP = new Set(['Alphanumeric', 'Free Text', 'Numeric', 'Mandatory', 'Optional', 'Prefilled', 'Dropdown']);
  const sheetSkus = new Map();
  for (let r = 2; r <= skuWs.rowCount; r += 1) {
    const row = skuWs.getRow(r);
    const sku = cellText(row, skuCol);
    const name = cellText(row, nameCol);
    if (!sku || !name || SKIP.has(sku) || !/^[A-Za-z0-9 _-]+$/.test(sku)) continue;
    sheetSkus.set(sku, {
      row: r,
      name,
      classification: classCol ? cellText(row, header.get(classCol)) : '',
      hierarchyCode: hcCol ? cellText(row, header.get(hcCol)) : '',
      isSaleable: saleableCol ? cellText(row, header.get(saleableCol)) : '',
    });
  }
  console.log('\nSKU MASTER rows parsed:', sheetSkus.size);
  const clsCounts = {};
  for (const v of sheetSkus.values()) clsCounts[v.classification || '(blank)'] = (clsCounts[v.classification || '(blank)'] || 0) + 1;
  console.log('Sheet classifications:', JSON.stringify(clsCounts));

  await connectDB();
  const dbProds = await Product.find({}).select('sku name classification isActive isSaleable hierarchyCode').lean();
  const dbBySku = new Map(dbProds.map((p) => [p.sku, p]));

  const missingInDb = [...sheetSkus.keys()].filter((s) => !dbBySku.has(s));
  const inDbNotSheet = dbProds.filter((p) => p.sku && !sheetSkus.has(p.sku)).map((p) => `${p.sku}:${p.name}`);
  console.log('\nSKUs in sheet but MISSING in DB:', missingInDb.length, JSON.stringify(missingInDb.slice(0, 50)));
  console.log('SKUs in DB but not in this sheet:', inDbNotSheet.length, JSON.stringify(inDbNotSheet.slice(0, 30)));

  // --- Categories sheet ---
  const catWs = wb.getWorksheet('Categories') || wb.worksheets.find((w) => /categor/i.test(w.name));
  if (catWs) {
    const ch = new Map();
    catWs.getRow(1).eachCell((cell, col) => ch.set(String(cell.value || '').trim(), col));
    console.log('\nCATEGORIES sheet headers:', [...ch.keys()].join(' | '));
    const mainKey = [...ch.keys()].find((k) => /main/i.test(k));
    const subKey = [...ch.keys()].find((k) => /sub ?categor/i.test(k));
    const prodKey = [...ch.keys()].find((k) => /product ?categor|^product/i.test(k));
    const mains = new Set();
    const subs = new Set();
    const leaves = new Set();
    let lastMain = '';
    let lastSub = '';
    for (let r = 2; r <= catWs.rowCount; r += 1) {
      const row = catWs.getRow(r);
      const m = cellText(row, ch.get(mainKey));
      const s = cellText(row, ch.get(subKey));
      const l = prodKey ? cellText(row, ch.get(prodKey)) : '';
      if (m && !SKIP.has(m)) { lastMain = m; mains.add(m); }
      if (s && !SKIP.has(s)) { lastSub = s; subs.add(`${lastMain}>${s}`); }
      if (l && !SKIP.has(l)) leaves.add(`${lastMain}>${lastSub}>${l}`);
    }
    console.log(`Sheet categories: L1=${mains.size} L2=${subs.size} L3=${leaves.size}`);
    console.log('Sheet L1 names:', JSON.stringify([...mains]));

    const dbCats = await Category.find({}).select('name level isActive').lean();
    const dbL1 = dbCats.filter((c) => c.level === 1 && c.isActive).map((c) => c.name);
    console.log('DB active L1 names:', JSON.stringify(dbL1));
    const missL1 = [...mains].filter((m) => !dbL1.some((d) => d.trim().toLowerCase() === m.trim().toLowerCase()));
    console.log('Sheet L1 missing in DB:', JSON.stringify(missL1));
  }

  // --- Collections sheet ---
  const collWs = wb.worksheets.find((w) => /collection/i.test(w.name));
  if (collWs) {
    console.log('\nCOLLECTIONS sheet:', collWs.name, 'rows:', collWs.rowCount);
    for (let r = 1; r <= Math.min(collWs.rowCount, 30); r += 1) {
      const vals = [];
      collWs.getRow(r).eachCell({ includeEmpty: false }, (cell) => vals.push(String(cell.value ?? '').slice(0, 40)));
      if (vals.length) console.log(' ', r, vals.join(' | '));
    }
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
