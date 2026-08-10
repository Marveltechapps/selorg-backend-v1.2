/**
 * Full Master Sheet structural audit — no DB writes.
 * Usage: node scripts/audit-mastersheet-structure.js "<path-to-xlsx>"
 */
const ExcelJS = require('exceljs');
const path = require('path');

function cellVal(cell) {
  let v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.hyperlink) return String(v.text || v.hyperlink);
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    return JSON.stringify(v).slice(0, 120);
  }
  return String(v);
}

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '');
}

function headerMap(ws, rowNum) {
  const map = new Map();
  ws.getRow(rowNum).eachCell({ includeEmpty: false }, (cell, col) => {
    const k = cellVal(cell).trim();
    if (k && !map.has(k)) map.set(k, col);
  });
  return map;
}

function findHeader(map, aliases) {
  const wanted = aliases.map(norm);
  for (const [h, col] of map.entries()) {
    if (wanted.includes(norm(h))) return { header: h, col };
  }
  for (const [h, col] of map.entries()) {
    const n = norm(h);
    for (const a of wanted) {
      if (n.includes(a) || a.includes(n)) return { header: h, col, partial: true };
    }
  }
  return null;
}

function countNonEmpty(ws, col, startRow, maxRows = 500) {
  let n = 0;
  const end = Math.min(ws.rowCount, startRow + maxRows);
  for (let r = startRow; r <= end; r += 1) {
    if (cellVal(ws.getRow(r).getCell(col)).trim()) n += 1;
  }
  return n;
}

function sampleValues(ws, col, startRow, limit = 5) {
  const out = [];
  for (let r = startRow; r <= ws.rowCount && out.length < limit; r += 1) {
    const v = cellVal(ws.getRow(r).getCell(col)).trim();
    if (v) out.push({ row: r, value: v.slice(0, 100) });
  }
  return out;
}

(async () => {
  const file =
    process.argv[2] ||
    path.join(__dirname, '..', '..', 'Customer-App-v2', 'Selorg_Final_Template (1).xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  console.log('============================================================');
  console.log('MASTER SHEET STRUCTURAL AUDIT');
  console.log('FILE:', file);
  console.log('SHEETS:', wb.worksheets.map((w) => w.name).join(' | '));
  console.log('============================================================');

  // ---- Per-sheet dump ----
  for (const ws of wb.worksheets) {
    console.log(`\n### SHEET: "${ws.name}" (rows=${ws.rowCount}, cols=${ws.columnCount})`);
    for (let r = 1; r <= Math.min(4, ws.rowCount); r += 1) {
      const cells = [];
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
        const s = cellVal(cell).trim();
        if (s) cells.push(`[${col}]${s.slice(0, 50)}`);
      });
      if (cells.length) console.log(`  R${r}: ${cells.join(' | ')}`);
    }
  }

  // ---- Required feature checklist ----
  console.log('\n============================================================');
  console.log('FEATURE CHECKLIST vs EXPECTED NEW DATA');
  console.log('============================================================');

  const expectedSheets = {
    'SKU Master': true,
    Categories: true,
    'Category Display Image': true,
    'Banner Details': true,
    'SubCategory Media': false,
    'Sub Category Media': false,
    'Category Media': false,
    'Category Banner': false,
  };

  console.log('\n-- Sheet presence --');
  for (const [name, requiredExisting] of Object.entries(expectedSheets)) {
    const found = !!wb.getWorksheet(name) || wb.worksheets.some((w) => norm(w.name) === norm(name));
    console.log(`  ${found ? 'FOUND' : 'MISSING'}: "${name}"${requiredExisting && !found ? ' (expected for core import)' : ''}`);
  }

  // Fuzzy sheet names related to media / limit
  console.log('\n-- Sheets matching media/limit/banner/subcategory --');
  for (const ws of wb.worksheets) {
    if (/media|banner|limit|order|sub.?categor|youtube|video/i.test(ws.name)) {
      console.log(`  MATCH: "${ws.name}"`);
    }
  }

  // SKU Master MaxOrderLimit
  const skuWs = wb.getWorksheet('SKU Master');
  if (skuWs) {
    const h1 = headerMap(skuWs, 1);
    console.log('\n-- SKU Master headers (row 1) --');
    console.log([...h1.keys()].join(' || '));

    const limitHit = findHeader(h1, [
      'MaxOrderLimit',
      'Max Order Limit',
      'Maximum Order Limit',
      'Product Order Limit',
      'Purchase Limit',
      'Max Order Qty',
      'Max Qty Per Order',
      'Max Qty',
    ]);
    console.log('\n-- MaxOrderLimit column --');
    if (limitHit) {
      console.log(`  FOUND as "${limitHit.header}" col=${limitHit.col}${limitHit.partial ? ' (PARTIAL MATCH)' : ''}`);
      console.log(`  non-empty samples:`, sampleValues(skuWs, limitHit.col, 5, 8));
      console.log(`  non-empty count (first 500 data rows):`, countNonEmpty(skuWs, limitHit.col, 5));
    } else {
      console.log('  MISSING — no MaxOrderLimit / Purchase Limit column on SKU Master');
    }

    // Check Threshold Qty confusion
    const thresh = findHeader(h1, ['Threshold Qty', 'Threshold Quantity']);
    if (thresh) {
      console.log(`  NOTE: "${thresh.header}" exists (operational threshold — NOT MaxOrderLimit)`);
    }
  }

  // Categories sheet structure
  const catWs = wb.getWorksheet('Categories');
  if (catWs) {
    const h = headerMap(catWs, 1);
    console.log('\n-- Categories sheet headers --');
    console.log([...h.keys()].join(' || '));
    const mediaOnCat = ['Banner Image', 'Banner Video', 'YouTube', 'Youtube', 'BannerImage', 'BannerVideo'];
    for (const a of mediaOnCat) {
      const hit = findHeader(h, [a]);
      console.log(`  column "${a}": ${hit ? `FOUND as "${hit.header}"` : 'MISSING'}`);
    }
  }

  // Category Display Image — check for banner/video/youtube extras
  const cdWs =
    wb.getWorksheet('Category Display Image') || wb.getWorksheet('Catogory display Image');
  if (cdWs) {
    const h = headerMap(cdWs, 1);
    console.log('\n-- Category Display Image headers --');
    console.log([...h.keys()].join(' || '));
    for (const a of [
      'Banner Image URL',
      'Banner Image',
      'Banner Video URL',
      'Banner Video',
      'YouTube URL',
      'Youtube URL',
      'Display Image URL',
    ]) {
      const hit = findHeader(h, [a]);
      console.log(`  column "${a}": ${hit ? `FOUND as "${hit.header}" col=${hit.col}` : 'MISSING'}`);
    }

    // Sample rows for level/name/url
    const levelCol = findHeader(h, ['Category Level']);
    const nameCol = findHeader(h, ['Category Name']);
    const urlCol = findHeader(h, ['Display Image URL']);
    console.log('\n  Sample Category Display Image rows:');
    for (let r = 2; r <= Math.min(12, cdWs.rowCount); r += 1) {
      const level = levelCol ? cellVal(cdWs.getRow(r).getCell(levelCol.col)).trim() : '';
      const name = nameCol ? cellVal(cdWs.getRow(r).getCell(nameCol.col)).trim() : '';
      const url = urlCol ? cellVal(cdWs.getRow(r).getCell(urlCol.col)).trim().slice(0, 80) : '';
      if (level || name) console.log(`    R${r}: level="${level}" name="${name}" url=${url ? 'YES' : 'NO'}`);
    }
  }

  // Banner Details — is this category-scoped?
  const banWs = wb.getWorksheet('Banner Details') || wb.getWorksheet('Banner');
  if (banWs) {
    let headerRow = 1;
    let h = headerMap(banWs, 1);
    if (![...h.keys()].some((k) => /banner/i.test(k))) {
      h = headerMap(banWs, 2);
      headerRow = 2;
    }
    console.log(`\n-- Banner Details headers (row ${headerRow}) --`);
    console.log([...h.keys()].join(' || '));
    for (const a of [
      'Category',
      'Category Name',
      'Sub Category',
      'SubCategory',
      'YouTube',
      'Youtube URL',
      'Banner Video',
      'Video URL',
    ]) {
      const hit = findHeader(h, [a]);
      console.log(`  column "${a}": ${hit ? `FOUND as "${hit.header}"` : 'MISSING'}`);
    }
  }

  // Relationship analysis: Categories hierarchy vs Category Display Image names
  if (catWs && cdWs) {
    const ch = headerMap(catWs, 1);
    const mainKey = [...ch.keys()].find((k) => /^(category|main)/i.test(k));
    const subKey = [...ch.keys()].find((k) => /sub/i.test(k));
    const mains = new Set();
    const subs = new Set();
    let lastMain = '';
    for (let r = 2; r <= Math.min(catWs.rowCount, 800); r += 1) {
      const m = mainKey ? cellVal(catWs.getRow(r).getCell(ch.get(mainKey))).trim() : '';
      const s = subKey ? cellVal(catWs.getRow(r).getCell(ch.get(subKey))).trim() : '';
      if (m) {
        lastMain = m;
        mains.add(m.toLowerCase());
      }
      if (s) subs.add(`${lastMain.toLowerCase()} > ${s.toLowerCase()}`);
    }
    const cdh = headerMap(cdWs, 1);
    const levelCol = findHeader(cdh, ['Category Level']);
    const nameCol = findHeader(cdh, ['Category Name']);
    const displayNames = { category: new Set(), subcategory: new Set() };
    for (let r = 2; r <= Math.min(cdWs.rowCount, 800); r += 1) {
      const level = levelCol ? cellVal(cdWs.getRow(r).getCell(levelCol.col)).trim().toLowerCase() : '';
      const name = nameCol ? cellVal(cdWs.getRow(r).getCell(nameCol.col)).trim().toLowerCase() : '';
      if (!name) continue;
      if (level.includes('sub')) displayNames.subcategory.add(name);
      else if (level.includes('categor')) displayNames.category.add(name);
    }
    console.log('\n-- Name relationship: Categories vs Category Display Image --');
    console.log(`  Categories L1 count: ${mains.size}`);
    console.log(`  Categories L2 count: ${subs.size}`);
    console.log(`  Display Image Category count: ${displayNames.category.size}`);
    console.log(`  Display Image SubCategory count: ${displayNames.subcategory.size}`);
    const orphanCats = [...displayNames.category].filter((n) => ![...mains].some((m) => m === n || m.includes(n) || n.includes(m)));
    const orphanSubs = [...displayNames.subcategory].filter(
      (n) => ![...subs].some((s) => s.endsWith(` > ${n}`) || s.includes(n))
    );
    console.log(`  Display L1 names with no Categories match (sample):`, orphanCats.slice(0, 10));
    console.log(`  Display L2 names with no Categories match (sample):`, orphanSubs.slice(0, 10));
  }

  console.log('\n============================================================');
  console.log('VERDICT SUMMARY');
  console.log('============================================================');
  const hasSubMedia = wb.worksheets.some((w) => /sub.?categor.*media/i.test(w.name));
  const hasCatMedia = wb.worksheets.some((w) => /^category media$/i.test(norm(w.name)) || /category banner/i.test(w.name));
  const skuHeaders = skuWs ? [...headerMap(skuWs, 1).keys()] : [];
  const hasMaxOrder = skuHeaders.some((k) => /max.?order.?limit|purchase.?limit|max.?order.?qty/i.test(k));
  const cdHeaders = cdWs ? [...headerMap(cdWs, 1).keys()] : [];
  const hasBannerColsOnDisplay = cdHeaders.some((k) => /banner.*(image|video)|youtube/i.test(k));

  console.log(JSON.stringify({
    hasMaxOrderLimitColumn: hasMaxOrder,
    hasSubCategoryMediaSheet: hasSubMedia,
    hasCategoryMediaSheet: hasCatMedia,
    hasBannerVideoYoutubeOnCategoryDisplayImage: hasBannerColsOnDisplay,
    canImportOrderLimits: hasMaxOrder,
    canImportCategorySubCategoryMedia: hasSubMedia || hasCatMedia || hasBannerColsOnDisplay,
    rootCauseIfDataMissingAfterUpload: !hasMaxOrder && !hasSubMedia && !hasCatMedia && !hasBannerColsOnDisplay
      ? 'Master Sheet does not contain the new columns/sheets — importer has nothing to read'
      : 'Sheet has some new fields — check import path / API mapping / which upload endpoint was used',
  }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
