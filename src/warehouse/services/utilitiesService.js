const AccessLog = require('../models/AccessLog');
const InventoryItem = require('../models/InventoryItem');
const StorageLocation = require('../models/StorageLocation');

/**
 * Parse CSV buffer to rows. Expects header: SKU, Name, Category, Price, Quantity (or similar)
 */
function parseCSV(buffer) {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(',').map(s => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(s => s.trim());
    const row = {};
    header.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

/**
 * @desc Warehouse Utilities Service
 */
const utilitiesService = {
  uploadSKUs: async (file) => {
    if (!file || !file.buffer) {
      throw new Error('No file or file buffer provided');
    }
    const rows = parseCSV(file.buffer);
    let imported = 0;
    let errors = 0;
    for (const row of rows) {
      const sku = (row.sku || row.SKU || '').trim();
      const productName = (row.name || row.Name || row.productname || '').trim();
      const category = (row.category || row.Category || '').trim();
      const price = parseFloat(row.price || row.Price || 0) || 0;
      const qty = parseInt(row.quantity || row.Quantity || 0, 10) || 0;
      if (!sku || !productName || !category) {
        errors++;
        continue;
      }
      try {
        await InventoryItem.findOneAndUpdate(
          { sku },
          {
            id: sku,
            sku,
            productName,
            category,
            currentStock: qty,
            minStock: 0,
            maxStock: 1000,
            location: 'TBD',
            value: price * qty,
            lastUpdated: new Date(),
          },
          { upsert: true, new: true }
        );
        imported++;
      } catch (e) {
        errors++;
      }
    }
    return {
      success: true,
      imported,
      errors,
      message: `Bulk SKU import completed. Imported: ${imported}, Errors: ${errors}`,
    };
  },

  getZones: async () => {
    const zones = await StorageLocation.distinct('zone');
    return (zones || []).filter(z => z != null && String(z).trim()).sort();
  },

  getAccessLogs: async (filters = {}) => {
    const query = {};
    if (filters.user) query.user = filters.user;
    if (filters.startDate && filters.endDate) {
      query.timestamp = { $gte: new Date(filters.startDate), $lte: new Date(filters.endDate) };
    }
    return await AccessLog.find(query).sort({ timestamp: -1 });
  },

  generateLabels: async (data) => {
    // Mock label generation logic
    return {
      success: true,
      labelCount: 24,
      printUrl: 'http://warehouse-print-server/jobs/label-abc-123.pdf'
    };
  },

  reassignBins: async (data) => {
    const fromZone = data.fromZone || data.from_zone || '';
    const toZone = data.toZone || data.to_zone || '';
    const skuFilter = data.skuFilter || data.sku_filter || '';
    if (!fromZone || !toZone) {
      throw new Error('fromZone and toZone are required');
    }
    const query = { zone: fromZone };
    if (skuFilter) {
      query.sku = { $regex: skuFilter, $options: 'i' };
    }
    const locations = await StorageLocation.find(query).lean();
    let itemsMoved = 0;
    for (const loc of locations) {
      await StorageLocation.updateOne(
        { _id: loc._id },
        { $set: { zone: toZone, updatedAt: new Date() } }
      );
      itemsMoved++;
    }
    return {
      success: true,
      itemsMoved,
      message: `Successfully moved ${itemsMoved} location(s) from ${fromZone} to ${toZone}`,
    };
  },

  printBarcodes: async (data) => {
    // Mock barcode printing logic
    return {
      success: true,
      quantity: data.quantity || 1,
      printJobId: 'JOB-9988'
    };
  }
};

module.exports = utilitiesService;

