/** Check Master Sheet classification for variant-only groups + S13xxx hierarchy codes. */
const ExcelJS = require('exceljs');

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
  const ws = wb.getWorksheet('SKU Master');
  const h = new Map();
  ws.getRow(1).eachCell((cell, col) => h.set(String(cell.value || '').trim(), col));
  const skuCol = h.get('SKU Code');
  const nameCol = h.get('SKU Name');
  const classCol = h.get('SKU Classification');
  const hcCol = [...h.keys()].find((k) => k.toLowerCase().includes('hierarchy code'));

  const targets = new Set([
    'S7429', 'S7430', 'S7431', 'S8635', 'S8636', 'S8637', 'S5401', 'S5402', 'S5403',
    'S9626', 'S9627', 'S9628', 'S9629', 'S7281', 'S7282', 'S7283', 'S898', 'S899', 'S900',
    'S7397', 'S7398', 'S7399', 'S7445', 'S7446', 'S7447', 'S7461', 'S7462', 'S7463',
    'S7477', 'S7478', 'S7479', 'S7413', 'S7414', 'S7415',
    'S13056', 'S13001', 'S13217', 'S13387',
  ]);
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const sku = cellText(row, skuCol);
    if (!targets.has(sku)) continue;
    console.log(`r${r} ${sku} | "${cellText(row, nameCol)}" | class="${cellText(row, h.get('SKU Classification'))}" | hc="${cellText(row, h.get(hcCol))}"`);
  }
})();
