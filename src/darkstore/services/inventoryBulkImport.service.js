const ExcelJS = require('exceljs');
const InventoryItem = require('../models/InventoryItem');
const Shelf = require('../models/Shelf');
const ShelfSKU = require('../models/ShelfSKU');
const AuditLog = require('../models/AuditLog');
const { generateId } = require('../../utils/helpers');

const VALID_CATEGORIES = ['Produce', 'Dairy', 'Bakery', 'Pantry', 'Snacks', 'Spreads', 'Supplements'];

const COLUMN_ALIASES = {
  sku: ['sku', 'sku code', 'sku_code', 'product sku'],
  product_name: ['product_name', 'product name', 'name', 'product'],
  category: ['category', 'cat'],
  stock: ['stock', 'quantity', 'qty', 'units', 'current_stock'],
  location: ['location', 'shelf', 'shelf_location', 'bin', 'shelf location'],
  barcode: ['barcode', 'bar code', 'ean'],
};

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

function mapRow(rawRow) {
  const mapped = {};
  const entries = Object.entries(rawRow || {});
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const [hdr, val] of entries) {
      const n = normalizeHeader(hdr);
      if (aliases.includes(n) || n === key.replace('_', ' ')) {
        mapped[key] = val;
        break;
      }
    }
  }
  return mapped;
}

function parseLocationCode(location) {
  const loc = String(location || '').trim().toUpperCase();
  if (!loc) return null;
  const parts = loc.split('-').filter(Boolean);
  if (parts.length >= 3) {
    return {
      aisle: parts[0].charAt(0),
      shelf_number: parseInt(parts[1], 10) || 1,
      location_code: loc,
    };
  }
  const m = loc.match(/^([A-F])[- ]?(\d+)/i);
  if (!m) {
    return { aisle: 'A', shelf_number: 1, location_code: loc };
  }
  const aisle = m[1].toUpperCase();
  const shelfNum = parseInt(m[2], 10) || 1;
  return {
    aisle,
    shelf_number: shelfNum,
    location_code: `${aisle}-${String(shelfNum).padStart(2, '0')}-01`,
  };
}

function deriveStatus(stock) {
  if (stock <= 0) return 'Out of Stock';
  if (stock > 100) return 'Overstocked';
  if (stock >= 15) return 'Fast Movers';
  return 'Slow Movers';
}

async function ensureShelfForLocation(storeId, zone, location) {
  const parsed = parseLocationCode(location);
  if (!parsed) return null;

  let shelf = await Shelf.findOne({ store_id: storeId, location_code: parsed.location_code });
  if (!shelf) {
    shelf = await Shelf.create({
      shelf_id: generateId('SHF'),
      location_code: parsed.location_code,
      aisle: parsed.aisle,
      shelf_number: parsed.shelf_number,
      zone,
      section: `Aisle ${parsed.aisle}`,
      status: 'normal',
      is_critical: false,
      is_misplaced: false,
      store_id: storeId,
    });
  }
  return shelf;
}

async function syncShelfSku(shelf, sku, productName, stockCount) {
  await ShelfSKU.findOneAndUpdate(
    { shelf_id: shelf.shelf_id, sku },
    {
      shelf_id: shelf.shelf_id,
      sku,
      product_name: productName,
      stock_count: stockCount,
    },
    { upsert: true, new: true }
  );

  const isCritical = stockCount === 0;
  await Shelf.updateOne(
    { shelf_id: shelf.shelf_id },
    {
      is_critical: isCritical,
      status: isCritical ? 'critical' : 'normal',
    }
  );
}

async function parseUploadFile(buffer, ext) {
  const rows = [];
  const normalizedExt = String(ext || '').toLowerCase();

  if (normalizedExt === '.csv') {
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      if (Object.values(row).some((v) => String(v).trim())) rows.push(row);
    }
    return rows;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value ?? '').trim();
  });

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    row.eachCell((cell, col) => {
      const h = headers[col];
      if (h) obj[h] = cell.value != null ? String(cell.value).trim() : '';
    });
    if (Object.values(obj).some((v) => String(v).trim())) rows.push(obj);
  });

  return rows;
}

async function processInventoryRows(rows, options = {}) {
  const {
    storeId,
    zone = 'Zone 1 (Ambient)',
    validateOnly = false,
    userId = 'SYSTEM',
    userName = 'System',
  } = options;

  const errors = [];
  let processedRows = 0;
  const preview = [];
  const importedSkus = [];

  if (!validateOnly) {
    await InventoryItem.updateMany(
      { store_id: storeId },
      { $set: { imported_via_sheet: false } }
    );
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const mapped = mapRow(rows[i]);
    const sku = String(mapped.sku || '').trim();
    if (!sku) {
      errors.push({ row: rowNum, error: 'SKU is required' });
      continue;
    }

    const name = String(mapped.product_name || sku).trim();
    const stock = Math.max(0, parseInt(String(mapped.stock ?? '0'), 10) || 0);
    const categoryRaw = String(mapped.category || 'Pantry').trim();
    const category =
      VALID_CATEGORIES.find((c) => c.toLowerCase() === categoryRaw.toLowerCase()) || 'Pantry';
    const location = String(mapped.location || '').trim();
    const barcode = String(mapped.barcode || '').trim() || undefined;

    if (validateOnly) {
      preview.push({ row: rowNum, sku, name, stock, category, location });
      processedRows++;
      continue;
    }

    try {
      let item = await InventoryItem.findOne({ sku });
      const status = deriveStatus(stock);

      if (item) {
        item.name = name;
        item.stock = stock;
        item.category = category;
        item.status = status;
        item.store_id = storeId;
        if (location) item.location = location;
        if (barcode) item.barcode = barcode;
        item.imported_via_sheet = true;
        await item.save();
      } else {
        item = await InventoryItem.create({
          id: sku,
          sku,
          name,
          category,
          stock,
          status,
          trend: 'stable',
          store_id: storeId,
          location: location || undefined,
          barcode,
          imported_via_sheet: true,
        });
      }

      importedSkus.push(sku);

      if (location) {
        const shelf = await ensureShelfForLocation(storeId, zone, location);
        if (shelf) await syncShelfSku(shelf, sku, name, stock);
      }

      try {
        const {
          applyOperationalStockBySku,
        } = require('../../customer-backend/services/inventoryAvailabilitySync');
        // eslint-disable-next-line no-await-in-loop
        await applyOperationalStockBySku(sku, stock, {
          ensureListed: true,
          mirrorCatalogStock: true,
          invalidateCache: false,
        });
      } catch (_) {
        /* customer product may not exist for this darkstore SKU yet */
      }

      processedRows++;
    } catch (err) {
      errors.push({ row: rowNum, error: err.message || 'Failed to save row' });
    }
  }

  if (!validateOnly && processedRows > 0) {
    try {
      const {
        invalidateCustomerCatalogCaches,
      } = require('../../customer-backend/services/inventoryAvailabilitySync');
      await invalidateCustomerCatalogCaches();
    } catch (_) {
      /* ignore */
    }
    await AuditLog.create({
      id: generateId('AUD'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      action: 'BULK_IMPORT',
      user: userName,
      user_id: userId,
      module: 'inventory',
      details: {
        processedRows,
        failedRows: errors.length,
        totalRows: rows.length,
        importedSkus,
      },
      store_id: storeId,
    });
  }

  return {
    totalRows: rows.length,
    processedRows,
    failedRows: errors.length,
    errors,
    preview,
  };
}

function buildTemplateCsv() {
  return [
    'sku,product_name,category,stock,location,barcode',
    'SKU-101,Organic Milk 1L,Dairy,24,A-01-01,890101',
    'SKU-102,Whole Wheat Bread,Bakery,12,A-01-02,890102',
    'SKU-103,Fresh Tomatoes 500g,Produce,30,A-02-01,890103',
  ].join('\n');
}

/**
 * Build shelf-view payload from inventory items when Shelf collection is empty.
 */
async function buildShelfViewFromInventory(storeId, zone, selectedShelfLocation) {
  const items = await InventoryItem.find({
    store_id: storeId,
    imported_via_sheet: true,
  }).lean();
  const aisleMap = {};
  let emptyShelves = 0;
  let criticalShelves = 0;

  for (const item of items) {
    const location = item.location || 'U-00-00';
    const parsed = parseLocationCode(location) || { aisle: 'U', shelf_number: 0, location_code: 'U-00-00' };
    const aisleKey = parsed.aisle;

    if (!aisleMap[aisleKey]) {
      aisleMap[aisleKey] = { aisle: aisleKey, shelves: [] };
    }

    let shelf = aisleMap[aisleKey].shelves.find((s) => s.location_code === parsed.location_code);
    if (!shelf) {
      shelf = {
        shelf_number: parsed.shelf_number,
        location_code: parsed.location_code,
        status: 'normal',
        is_critical: false,
        is_misplaced: false,
        assigned_skus: [],
      };
      aisleMap[aisleKey].shelves.push(shelf);
    }

    shelf.assigned_skus.push({
      sku: item.sku,
      product_name: item.name,
      stock_count: item.stock,
    });

    if (item.stock === 0) {
      shelf.is_critical = true;
      shelf.status = 'critical';
      criticalShelves++;
    }
  }

  const aisles = Object.values(aisleMap).map((a) => {
    a.shelves.sort((x, y) => String(x.location_code).localeCompare(String(y.location_code)));
    emptyShelves += a.shelves.filter((s) => !s.assigned_skus.length).length;
    return a;
  });

  aisles.sort((a, b) => String(a.aisle).localeCompare(String(b.aisle)));

  const defaultLocation =
    selectedShelfLocation ||
    (aisles[0]?.shelves[0]?.location_code ?? null);

  let selectedShelf = null;
  if (defaultLocation) {
    for (const aisle of aisles) {
      const shelf = aisle.shelves.find((s) => s.location_code === defaultLocation);
      if (shelf) {
        selectedShelf = {
          location_code: shelf.location_code,
          section: `Aisle ${aisle.aisle}`,
          status: shelf.status,
          is_critical: shelf.is_critical,
          assigned_skus: shelf.assigned_skus,
          issues: shelf.is_critical
            ? [{ type: 'low_stock', message: 'One or more SKUs are out of stock', severity: 'high' }]
            : [],
          recent_activity: [],
        };
        break;
      }
    }
  }

  return {
    alerts: {
      empty_shelves: emptyShelves,
      misplaced_items: 0,
      damaged_goods_reports: 0,
      critical_shelves: criticalShelves,
    },
    zone,
    aisles,
    selected_shelf: selectedShelf,
    source: 'inventory',
  };
}

module.exports = {
  parseUploadFile,
  processInventoryRows,
  buildTemplateCsv,
  buildShelfViewFromInventory,
  parseLocationCode,
};
