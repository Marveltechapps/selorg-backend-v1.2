/**
 * Single operational inventory sync for the customer web app.
 *
 * Source of truth for sellable qty:
 *   store_inventory (per DarkStore) mirrored onto Product.stockQuantity
 * Live APIs use max(catalog stockQuantity, store sellable) via productStock.js
 *
 * Call applyOperationalStock / applyOperationalStockBySku after any restock
 * so catalog flags, store_inventory, and customer caches stay consistent.
 */
const mongoose = require('mongoose');
const { StoreInventory } = require('../models/StoreInventory');
const { DarkStore } = require('../models/DarkStore');
const { Product } = require('../models/Product');
const cacheService = require('../../core/services/cache.service');

const DEFAULT_DARK_STORE_CODE = process.env.DEFAULT_DARK_STORE_CODE || 'DS-Adyar-01';

let cachedDefaultStoreId = null;

async function resolveDefaultDarkStoreId() {
  if (cachedDefaultStoreId) return cachedDefaultStoreId;
  const code = DEFAULT_DARK_STORE_CODE;
  let store =
    (await DarkStore.findOne({ code, isActive: true }).select('_id').lean()) ||
    (await DarkStore.findOne({ code }).select('_id').lean()) ||
    (await DarkStore.findOne({ isActive: true }).select('_id').lean());
  if (store?._id) {
    cachedDefaultStoreId = store._id;
    return cachedDefaultStoreId;
  }
  return null;
}

/**
 * Bust customer GET caches so listings / PDP / home reflect stock immediately.
 */
async function invalidateCustomerCatalogCaches() {
  try {
    await cacheService.delPattern('cache:*');
  } catch (err) {
    console.error('[inventoryAvailabilitySync] cache invalidation failed', err?.message || err);
  }
}

function normalizeQty(quantity) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/**
 * When operational stock > 0 and the product has a sellable price, ensure it
 * is listed and buyable (isActive + isSaleable + status). Image is not required
 * for restock activation — admin intentionally put units on the shelf.
 */
async function ensureListedWhenInStock(productId, quantity, session = null) {
  const qty = normalizeQty(quantity);
  if (qty <= 0) return null;
  const oid = toObjectId(productId);
  if (!oid) return null;

  const q = Product.findById(oid).select('sku price imageUrl images isActive isSaleable status').lean();
  if (session) q.session(session);
  const product = await q;
  if (!product) return null;

  // Legacy seed/demo SKUs (PROD-*) must never be re-activated by a restock.
  if (/^PROD-\d+$/i.test(String(product.sku || ''))) return product;

  const price = Number(product.price) || 0;
  if (price <= 0) return product;

  const needsFlip =
    product.isActive === false ||
    product.isSaleable === false ||
    product.status === 'inactive' ||
    product.status === 'draft';

  if (!needsFlip) return product;

  const updateQ = Product.updateOne(
    { _id: oid },
    { $set: { isActive: true, isSaleable: true, status: 'active' } }
  );
  if (session) updateQ.session(session);
  await updateQ;
  return product;
}

/**
 * Upsert store_inventory + mirror qty onto Product.stockQuantity/stock.
 * Optionally activates listing flags when qty > 0 and price > 0.
 *
 * @param {object} opts
 * @param {string|ObjectId} opts.productId
 * @param {number} opts.quantity
 * @param {string|ObjectId} [opts.storeId] DarkStore ObjectId (defaults to Adyar)
 * @param {boolean} [opts.isAvailable]
 * @param {boolean} [opts.mirrorCatalogStock=true]
 * @param {boolean} [opts.ensureListed=true]
 * @param {boolean} [opts.invalidateCache=true]
 * @param {import('mongoose').ClientSession} [opts.session]
 */
async function applyOperationalStock(opts = {}) {
  const productId = toObjectId(opts.productId);
  if (!productId) {
    return { ok: false, error: 'Invalid productId' };
  }

  const quantity = normalizeQty(opts.quantity);
  const isAvailable = opts.isAvailable !== undefined ? Boolean(opts.isAvailable) : quantity > 0;
  const mirrorCatalogStock = opts.mirrorCatalogStock !== false;
  const ensureListed = opts.ensureListed !== false;
  const invalidateCache = opts.invalidateCache !== false;
  const session = opts.session || null;

  let storeId = toObjectId(opts.storeId);
  if (!storeId) {
    storeId = await resolveDefaultDarkStoreId();
  }

  let inventory = null;
  if (storeId) {
    const invQ = StoreInventory.findOneAndUpdate(
      { storeId, productId },
      {
        $set: {
          quantity,
          isAvailable,
          lastUpdatedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (session) invQ.session(session);
    inventory = await invQ;
  }

  if (mirrorCatalogStock) {
    const prodQ = Product.updateOne(
      { _id: productId },
      {
        $set: {
          stockQuantity: quantity,
          stock: quantity,
          ...(Number.isFinite(Number(opts.fixedStock)) ? { fixedStock: Number(opts.fixedStock) } : {}),
        },
      }
    );
    if (session) prodQ.session(session);
    await prodQ;
  }

  if (ensureListed) {
    await ensureListedWhenInStock(productId, quantity, session);
  }

  if (invalidateCache) {
    await invalidateCustomerCatalogCaches();
  }

  return {
    ok: true,
    productId: String(productId),
    storeId: storeId ? String(storeId) : null,
    quantity,
    isAvailable,
    inventory,
  };
}

/**
 * Resolve customer Product by SKU and apply operational stock.
 */
async function applyOperationalStockBySku(sku, quantity, opts = {}) {
  const code = String(sku || '').trim();
  if (!code) return { ok: false, error: 'SKU required' };

  const q = Product.findOne({ sku: code }).select('_id').lean();
  if (opts.session) q.session(opts.session);
  const product = await q;
  if (!product?._id) {
    return { ok: false, error: `No customer product for SKU ${code}` };
  }

  return applyOperationalStock({
    ...opts,
    productId: product._id,
    quantity,
  });
}

/**
 * Batch apply after Master Sheet import (Fixed Stock rows).
 * Single cache invalidation at the end.
 */
async function applyOperationalStockBatch(items = [], opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const results = [];
  for (const item of list) {
    if (!item?.productId) continue;
    if (item.quantity === undefined || item.quantity === null || item.quantity === '') continue;
    // eslint-disable-next-line no-await-in-loop
    const r = await applyOperationalStock({
      productId: item.productId,
      quantity: item.quantity,
      storeId: item.storeId || opts.storeId,
      session: opts.session,
      mirrorCatalogStock: opts.mirrorCatalogStock !== false,
      ensureListed: opts.ensureListed !== false,
      invalidateCache: false,
      fixedStock: item.fixedStock,
    });
    results.push(r);
  }
  if (opts.invalidateCache !== false && results.length > 0) {
    await invalidateCustomerCatalogCaches();
  }
  return results;
}

module.exports = {
  DEFAULT_DARK_STORE_CODE,
  resolveDefaultDarkStoreId,
  invalidateCustomerCatalogCaches,
  applyOperationalStock,
  applyOperationalStockBySku,
  applyOperationalStockBatch,
  ensureListedWhenInStock,
};
