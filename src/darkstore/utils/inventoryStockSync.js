const Shelf = require('../models/Shelf');
const ShelfSKU = require('../models/ShelfSKU');

function deriveInventoryStatus(stock) {
  if (stock <= 0) return 'Out of Stock';
  if (stock > 100) return 'Overstocked';
  if (stock >= 15) return 'Fast Movers';
  return 'Slow Movers';
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve inventory item by SKU, product name, or barcode within a store.
 */
async function resolveInventoryItem(InventoryItem, storeId, input) {
  const term = String(input || '').trim();
  if (!term) return null;

  let item = await InventoryItem.findOne({ store_id: storeId, sku: term });
  if (item) return item;

  item = await InventoryItem.findOne({
    store_id: storeId,
    sku: { $regex: new RegExp(`^${escapeRegex(term)}$`, 'i') },
  });
  if (item) return item;

  item = await InventoryItem.findOne({
    store_id: storeId,
    name: { $regex: new RegExp(`^${escapeRegex(term)}$`, 'i') },
  });
  if (item) return item;

  if (term.length >= 3) {
    item = await InventoryItem.findOne({
      store_id: storeId,
      name: { $regex: new RegExp(escapeRegex(term), 'i') },
    });
    if (item) return item;
  }

  item = await InventoryItem.findOne({ store_id: storeId, barcode: term });
  return item;
}

/**
 * Keep shelf SKU counts in sync when item stock changes.
 */
async function syncShelfStockForItem(item) {
  if (!item?.location) return;

  const shelf = await Shelf.findOne({
    store_id: item.store_id,
    location_code: item.location,
  });
  if (!shelf) return;

  await ShelfSKU.findOneAndUpdate(
    { shelf_id: shelf.shelf_id, sku: item.sku },
    {
      shelf_id: shelf.shelf_id,
      sku: item.sku,
      product_name: item.name,
      stock_count: item.stock,
    },
    { upsert: true, new: true }
  );

  const isCritical = item.stock === 0;
  await Shelf.updateOne(
    { shelf_id: shelf.shelf_id },
    {
      is_critical: isCritical,
      status: isCritical ? 'critical' : 'normal',
    }
  );
}

module.exports = {
  deriveInventoryStatus,
  resolveInventoryItem,
  syncShelfStockForItem,
};
