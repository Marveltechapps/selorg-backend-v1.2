const mongoose = require('mongoose');
const { StoreInventory } = require('../models/StoreInventory');

/**
 * Catalog Fixed Stock (`stockQuantity` / `stock`) from the master sheet.
 * Often 0 when the sheet Fixed Stock column is empty — not the operational sellable qty.
 */
function resolveCatalogStock(product) {
  if (!product || typeof product !== 'object') return 0;
  const qtyRaw = product.catalogStockQuantity ?? product.stockQuantity;
  const stockRaw = product.stock;
  let n = NaN;
  if (qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== '') {
    n = Number(qtyRaw);
  } else if (stockRaw !== undefined && stockRaw !== null && stockRaw !== '') {
    n = Number(stockRaw);
  }
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function sellableFromInventoryRow(row) {
  if (!row || row.isAvailable === false) return 0;
  const qty = Number(row.quantity) || 0;
  const reserved = Number(row.reservedQty) || 0;
  return Math.max(0, Math.floor(qty - reserved));
}

/**
 * Operational sellable stock from dark-store StoreInventory.
 * When storeId is omitted, uses the best available qty across stores
 * (web app currently does not pass a customer store yet; orders still need in-stock accuracy).
 */
async function getStoreSellableQtyMap(productIds, storeId = null) {
  const ids = [...new Set(
    (productIds || [])
      .map((id) => {
        const s = String(id || '').trim();
        return s && mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : null;
      })
      .filter(Boolean),
  )];
  const map = new Map();
  if (ids.length === 0) return map;

  const filter = {
    productId: { $in: ids },
    isAvailable: true,
    quantity: { $gt: 0 },
  };
  if (storeId && mongoose.Types.ObjectId.isValid(String(storeId))) {
    filter.storeId = new mongoose.Types.ObjectId(String(storeId));
  }

  const rows = await StoreInventory.find(filter)
    .select('productId quantity reservedQty isAvailable storeId')
    .lean();

  for (const row of rows) {
    const key = String(row.productId);
    const sellable = sellableFromInventoryRow(row);
    if (sellable <= 0) continue;
    if (storeId) {
      map.set(key, sellable);
    } else {
      map.set(key, Math.max(map.get(key) || 0, sellable));
    }
  }
  return map;
}

/**
 * Live sellable units = max(catalog Fixed Stock, store inventory).
 * Store inventory is the operational source of truth for dark-store fulfillment.
 */
function resolveAvailableStock(product, storeQty = null) {
  const catalog = resolveCatalogStock(product);
  const fromStore =
    storeQty != null && Number.isFinite(Number(storeQty))
      ? Math.max(0, Math.floor(Number(storeQty)))
      : Number.isFinite(Number(product?.storeStock))
        ? Math.max(0, Math.floor(Number(product.storeStock)))
        : Number.isFinite(Number(product?.availableStock))
          ? Math.max(0, Math.floor(Number(product.availableStock)))
          : 0;
  return Math.max(catalog, fromStore);
}

function isProductPurchasable(product, storeQty = null) {
  if (!product) return false;
  if (product.isActive === false) return false;
  if (product.status === 'inactive' || product.status === 'draft') return false;
  // isSaleable gates listing; live stock comes from StoreInventory / stockQuantity.
  // Ignore catalog isPurchasable — it is often false while dark-store inventory exists.
  if (product.isSaleable === false) return false;
  return resolveAvailableStock(product, storeQty) > 0;
}

/**
 * Attach live sellable stock onto product docs for customer APIs.
 * Sets stock / stockQuantity to the live sellable qty (so clients reading those fields stay correct),
 * and keeps catalogStockQuantity / storeStock for debugging transparency.
 */
async function attachLiveSellableStock(products, options = {}) {
  const list = Array.isArray(products) ? products : [];
  if (list.length === 0) return list;
  const storeId = options.storeId || null;
  const ids = list.map((p) => p?._id || p?.id).filter(Boolean);
  const qtyById = await getStoreSellableQtyMap(ids, storeId);

  return list.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const id = String(p._id || p.id || '');
    const catalog = resolveCatalogStock(p);
    const storeStock = qtyById.get(id) || 0;
    const available = Math.max(catalog, storeStock);
    return {
      ...p,
      catalogStockQuantity: catalog,
      storeStock,
      availableStock: available,
      // Customer clients (web mapper) read these as sellable inventory.
      stockQuantity: available,
      stock: available,
    };
  });
}

async function resolveAvailableStockForProduct(product, options = {}) {
  if (!product) return 0;
  const id = product._id || product.id;
  if (!id) return resolveAvailableStock(product);
  const map = await getStoreSellableQtyMap([id], options.storeId || null);
  return resolveAvailableStock(product, map.get(String(id)) || 0);
}

function assertStockAllows(product, requestedQty, existingCartQty = 0, mode = 'set', storeQty = null) {
  if (!product) return { error: 'Product not found' };
  if (product.isActive === false || product.status === 'inactive' || product.status === 'draft') {
    return { error: 'This product is currently unavailable.' };
  }
  if (product.isSaleable === false) {
    return { error: 'This product is currently unavailable.' };
  }
  const available = resolveAvailableStock(product, storeQty);
  if (available <= 0) {
    return { error: 'This product is currently out of stock.' };
  }
  const desired =
    mode === 'add'
      ? (Number(existingCartQty) || 0) + (Number(requestedQty) || 0)
      : Number(requestedQty) || 0;
  if (desired > available) {
    return {
      error: `Only ${available} unit(s) available.`,
      available,
    };
  }
  return { available, stock: available, inStock: true };
}

async function assertStockAllowsAsync(product, requestedQty, existingCartQty = 0, mode = 'set', options = {}) {
  if (!product) return { error: 'Product not found' };
  const available = await resolveAvailableStockForProduct(product, options);
  return assertStockAllows(product, requestedQty, existingCartQty, mode, available);
}

module.exports = {
  resolveCatalogStock,
  resolveAvailableStock,
  resolveAvailableStockForProduct,
  isProductPurchasable,
  assertStockAllows,
  assertStockAllowsAsync,
  attachLiveSellableStock,
  getStoreSellableQtyMap,
};
