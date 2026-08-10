const mongoose = require('mongoose');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');
const { calculatePricing, compareWithLegacy } = require('./pricingEngineService');
const { pickFirstNonStubString } = require('../utils/mediaUrl');
const {
  resolveAvailableStock,
  resolveAvailableStockForProduct,
  resolveMaxOrderLimit,
  isProductPurchasable,
  assertStockAllowsAsync,
  attachLiveSellableStock,
} = require('../utils/productStock');

const usePricingEngine = true;

function normalizeUserId(userId) {
  if (userId instanceof mongoose.Types.ObjectId) return userId;
  const str = String(userId || '').trim();
  if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);
  return userId;
}

/** Drop cached GET /cart responses so checkout clears are visible immediately. */
async function invalidateCartGetCache() {
  try {
    const cacheService = require('../../core/services/cache.service');
    await cacheService.delPattern('cache:*customer/cart*');
    await cacheService.delPattern('cache:*/cart*');
  } catch (err) {
    console.warn('[cart-service] invalidateCartGetCache failed', err?.message || err);
  }
}

/**
 * Get cart for user; return shape expected by app.
 * Supports optional pricing context (coupon/zone/payment) for parity with createOrder.
 */
async function getCartForUser(userId, options = {}) {
  const uid = normalizeUserId(userId);
  await dedupeCartLines(uid);
  // Heal carts that exceeded MaxOrderLimit (e.g. guest merge before limit enforcement).
  await clampCartToMaxOrderLimits(uid);
  const cart = await Cart.findOne({ userId: uid }).lean();
  if (!cart || !cart.items || cart.items.length === 0) {
    return { items: [], itemTotal: 0, discount: 0, deliveryFee: 0, handlingCharge: 0, tax: 0, total: 0 };
  }
  return formatCartResponse(cart, { userId: uid, ...options });
}

/**
 * Cap each line at Master Sheet MaxOrderLimit so stale over-limit carts cannot
 * proceed to checkout display / payment with illegal quantities.
 */
async function clampCartToMaxOrderLimits(userId) {
  const uid = normalizeUserId(userId);
  const cart = await Cart.findOne({ userId: uid });
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) return false;

  const productIds = [
    ...new Set(
      cart.items
        .map((it) => String(it.productId || '').trim())
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
    ),
  ];
  if (productIds.length === 0) return false;

  const products = await Product.find({ _id: { $in: productIds } })
    .select('maxOrderLimit hierarchyCode classification')
    .lean();
  const withLimits = await Promise.all(products.map((p) => ensureMaxOrderLimitFromStyle(p)));
  const byId = new Map(withLimits.map((p) => [String(p._id), p]));

  let changed = false;
  for (const it of cart.items) {
    const max = resolveMaxOrderLimit(byId.get(String(it.productId)));
    if (max == null) continue;
    const qty = Number(it.quantity) || 0;
    if (qty > max) {
      it.quantity = max;
      changed = true;
    }
  }

  if (changed) {
    await cart.save();
    await invalidateCartGetCache();
  }
  return changed;
}

/** Stable cart line key — empty variantId and productId-only SKUs must match. */
function normalizeVariantId(productId, variantId) {
  const pid = String(productId || '').trim();
  const vid = variantId != null ? String(variantId).trim() : '';
  if (!vid || vid === pid) return pid;
  return vid;
}

function matchCartLine(it, productId, variantId) {
  const pid = String(productId || '').trim();
  const vid = normalizeVariantId(pid, variantId);
  const linePid = String(it.productId || '').trim();
  const lineVid = normalizeVariantId(it.productId, it.variantId);
  return linePid === pid && lineVid === vid;
}

/**
 * Resolve catalog keys and locate a cart line (handles parent vs SKU product ids).
 */
async function locateCartLine(cart, productId, variantId) {
  if (!cart || !Array.isArray(cart.items) || !productId) return null;

  let line = cart.items.find((it) => matchCartLine(it, productId, variantId));
  if (line) return line;

  const snapshot = await resolveLineSnapshot(productId, variantId);
  if (snapshot.error) return null;

  line = cart.items.find((it) =>
    matchCartLine(it, snapshot.lineProductId, snapshot.lineVariantId),
  );
  if (line) return line;

  return cart.items.find(
    (it) =>
      String(it.variantId || '').trim() === snapshot.lineVariantId &&
      (String(it.productId) === snapshot.lineProductId ||
        String(it.productId) === String(productId)),
  );
}

/**
 * Find a cart line by Mongo subdocument id, or by product + variant (when id missing on client).
 */
function findCartLine(cart, itemId, productId, variantId) {
  if (!cart || !Array.isArray(cart.items)) return null;
  if (itemId) {
    const byId = cart.items.find((it) => String(it._id) === String(itemId));
    if (byId) return byId;
  }
  if (productId != null) {
    return cart.items.find((it) => matchCartLine(it, productId, variantId));
  }
  return null;
}

async function formatCartResponse(cart, options = {}) {
  const { userId = null, couponCode = null, zone = null, paymentMethod = null } = options;
  let items = (cart.items || []).map((it) => ({
    id: String(it._id),
    productId: String(it.productId),
    productName: it.productName || '',
    variantId: normalizeVariantId(it.productId, it.variantId),
    variantSize: it.variantSize || '',
    quantity: it.quantity,
    price: it.price,
    originalPrice: it.originalPrice,
    gstRate: it.gstRate || 0,
    image: pickFirstString(it.image),
  }));
  items = await hydrateCartItemImages(items);
  items = await hydrateCartItemStock(items);
  const legacyItemTotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const legacyDeliveryFee = 0;
  const legacyDiscount = 0;
  const legacyTotal = legacyItemTotal + legacyDeliveryFee - legacyDiscount;

  let debugPricing = null;
  let engineTotals = null;

  try {
    debugPricing = await calculatePricing({
      userId,
      cartItems: items.map((it) => ({
        productId: it.productId,
        variantId: it.variantId || null,
        quantity: it.quantity,
        baseUnitPrice: it.price,
      })),
      couponCode,
      zone,
      paymentMethod,
      mode: 'cart',
    });
    engineTotals = debugPricing?.totals || null;
    compareWithLegacy(
      { itemTotal: legacyItemTotal, finalAmount: legacyTotal },
      engineTotals || {}
    );
  } catch (error) {
    console.warn('[cart-service] pricing engine shadow execution failed', {
      userId,
      message: error?.message || String(error),
    });
  }

  const itemTotal = usePricingEngine && engineTotals ? Number(engineTotals.itemTotal) || 0 : legacyItemTotal;
  const discount = usePricingEngine && engineTotals ? Number(engineTotals.discount) || 0 : legacyDiscount;
  const deliveryFee =
    usePricingEngine && engineTotals ? Number(engineTotals.deliveryFee) || 0 : legacyDeliveryFee;
  const handlingCharge =
    usePricingEngine && engineTotals ? Number(engineTotals.handlingCharge) || 0 : 0;
  const tax = usePricingEngine && engineTotals ? Number(engineTotals.tax) || 0 : 0;
  const total = usePricingEngine && engineTotals ? Number(engineTotals.finalAmount) || 0 : legacyTotal;

  // Optional: return line prices from pricing engine so list rows align with server-side pricing.
  if (usePricingEngine && Array.isArray(debugPricing?.items) && debugPricing.items.length) {
    const linePriceByKey = new Map();
    debugPricing.items.forEach((line) => {
      const key = `${String(line.productId || '')}::${String(line.variantId || '')}`;
      if (key && !linePriceByKey.has(key)) {
        linePriceByKey.set(key, Number(line.effectiveUnitPrice ?? line.unitPrice ?? line.baseUnitPrice ?? 0));
      }
    });
    items = items.map((item) => {
      const key = `${String(item.productId || '')}::${String(item.variantId || '')}`;
      const engineUnitPrice = linePriceByKey.get(key);
      if (!Number.isFinite(engineUnitPrice) || engineUnitPrice <= 0) return item;
      return {
        ...item,
        price: engineUnitPrice,
      };
    });
  }

  return {
    items,
    itemTotal,
    discount,
    deliveryFee,
    handlingCharge,
    tax,
    total,
    debugPricing,
  };
}

function pickFirstString(...vals) {
  return pickFirstNonStubString(...vals);
}

/** Match customer app + customerMediaEnrichment product image order. */
function pickPrimaryImage(product) {
  if (!product) return '';
  const img0 =
    Array.isArray(product.images) && product.images.length > 0 && typeof product.images[0] === 'string'
      ? product.images[0].trim()
      : '';
  return pickFirstString(product.thumbnailUrl, product.cardImageUrl, product.imageUrl, img0);
}

async function hydrateCartItemImages(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const missing = items.filter((it) => !pickFirstString(it.image));
  if (missing.length === 0) return items;

  const productIds = [
    ...new Set(
      missing
        .map((it) => String(it.productId || '').trim())
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
    ),
  ];
  if (productIds.length === 0) return items;

  const products = await Product.find({ _id: { $in: productIds } })
    .select('imageUrl thumbnailUrl cardImageUrl images')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  return items.map((it) => {
    if (pickFirstString(it.image)) return it;
    const catalog = byId.get(String(it.productId));
    const resolved = pickPrimaryImage(catalog);
    return resolved ? { ...it, image: resolved } : it;
  });
}

/** Attach live stockStatus from Product + StoreInventory onto each cart line. */
async function hydrateCartItemStock(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const productIds = [
    ...new Set(
      items
        .map((it) => String(it.productId || '').trim())
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
    ),
  ];
  if (productIds.length === 0) {
    return items.map((it) => ({ ...it, stock: 0, inStock: false }));
  }

  const products = await Product.find({ _id: { $in: productIds } })
    .select('stock stockQuantity isActive isSaleable isPurchasable status maxOrderLimit hierarchyCode classification')
    .lean();
  const withInherited = await Promise.all(products.map((p) => ensureMaxOrderLimitFromStyle(p)));
  const withStock = await attachLiveSellableStock(withInherited);
  const byId = new Map(withStock.map((p) => [String(p._id), p]));
  const { pickMaxOrderLimit } = require('../utils/catalogMediaFields');

  return items.map((it) => {
    const catalog = byId.get(String(it.productId));
    const stock = resolveAvailableStock(catalog);
    const inStock = isProductPurchasable(catalog);
    return {
      ...it,
      stock,
      inStock,
      storeStock: catalog?.storeStock,
      catalogStockQuantity: catalog?.catalogStockQuantity,
      maxOrderLimit: pickMaxOrderLimit(catalog || {}),
    };
  });
}

/**
 * When a Variant SKU has no MaxOrderLimit, inherit from the Style (or any sibling) row.
 */
async function ensureMaxOrderLimitFromStyle(catalogProduct) {
  if (!catalogProduct) return catalogProduct;
  if (resolveMaxOrderLimit(catalogProduct) != null) return catalogProduct;
  const code = String(catalogProduct.hierarchyCode || '').trim();
  if (!code) return catalogProduct;
  // Prefer Style sibling; otherwise any sibling that already has a limit.
  const style = await Product.findOne({
    hierarchyCode: code,
    classification: 'Style',
    isActive: true,
    maxOrderLimit: { $gt: 0 },
  })
    .select('maxOrderLimit')
    .lean();
  if (style && resolveMaxOrderLimit(style) != null) {
    return { ...catalogProduct, maxOrderLimit: style.maxOrderLimit };
  }
  const sibling = await Product.findOne({
    hierarchyCode: code,
    isActive: true,
    maxOrderLimit: { $gt: 0 },
    _id: { $ne: catalogProduct._id },
  })
    .select('maxOrderLimit')
    .lean();
  if (sibling && resolveMaxOrderLimit(sibling) != null) {
    return { ...catalogProduct, maxOrderLimit: sibling.maxOrderLimit };
  }
  return catalogProduct;
}

/**
 * Resolve catalog row + line keys for add-to-cart (embedded variants, single SKU, hierarchy sibling).
 */
async function resolveLineSnapshot(productId, variantId) {
  const pid = String(productId || '').trim();
  if (!pid || !mongoose.Types.ObjectId.isValid(pid)) {
    return { error: 'Product not found' };
  }

  let catalogProduct = await Product.findById(pid).lean();
  if (!catalogProduct) return { error: 'Product not found' };

  const requestedVid = variantId != null ? String(variantId).trim() : '';
  const lineVariantId = normalizeVariantId(pid, requestedVid);
  let lineProductId = pid;
  let price = Number(catalogProduct.price || 0);
  let originalPrice = Number(catalogProduct.originalPrice ?? catalogProduct.mrp ?? price);
  let variantSize = String(catalogProduct.size || catalogProduct.quantity || '').trim();
  let productName = catalogProduct.name || '';
  let image = pickPrimaryImage(catalogProduct);
  let gstRate = catalogProduct.gstRate || 0;

  if (Array.isArray(catalogProduct.variants) && catalogProduct.variants.length > 0) {
    const embedded = catalogProduct.variants.find(
      (v, i) =>
        String(v.id ?? v._id ?? `${pid}-v${i}`) === requestedVid ||
        String(v._id ?? '') === requestedVid,
    );
    if (embedded) {
      price = Number(embedded.price ?? catalogProduct.price ?? 0);
      originalPrice = Number(embedded.originalPrice ?? embedded.mrp ?? catalogProduct.mrp ?? price);
      variantSize = String(embedded.size || embedded.quantity || variantSize).trim() || '1 unit';
    }
  } else if (
    requestedVid &&
    requestedVid !== pid &&
    mongoose.Types.ObjectId.isValid(requestedVid)
  ) {
    const skuDoc = await Product.findById(requestedVid).lean();
    if (skuDoc) {
      catalogProduct = skuDoc;
      lineProductId = String(skuDoc._id);
      price = Number(skuDoc.price || 0);
      originalPrice = Number(skuDoc.originalPrice ?? skuDoc.mrp ?? price);
      variantSize = String(skuDoc.size || skuDoc.quantity || '').trim() || '1 unit';
      productName = skuDoc.name || productName;
      image = pickPrimaryImage(skuDoc) || image;
      gstRate = skuDoc.gstRate || gstRate;
    }
  }

  if (!variantSize) variantSize = '1 unit';

  // Variant SKUs sometimes omit MaxOrderLimit while the Style row has it — inherit for enforcement.
  catalogProduct = await ensureMaxOrderLimitFromStyle(catalogProduct);

  return {
    lineProductId,
    lineVariantId,
    variantSize,
    quantityPrice: price,
    originalPrice,
    productName,
    image,
    gstRate,
    catalogProduct,
  };
}

/**
 * Merge duplicate cart lines (same product + variant) before formatting.
 */
async function dedupeCartLines(userId) {
  const cart = await Cart.findOne({ userId });
  if (!cart || !Array.isArray(cart.items) || cart.items.length < 2) return;

  const merged = new Map();
  for (const it of cart.items) {
    const pid = String(it.productId);
    const vid = normalizeVariantId(pid, it.variantId);
    const key = `${pid}::${vid}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += Number(it.quantity) || 0;
      if (!pickFirstString(existing.image) && pickFirstString(it.image)) {
        existing.image = it.image;
      }
    } else {
      merged.set(key, { ...it.toObject?.() ?? it, productId: it.productId, variantId: vid });
    }
  }

  cart.items = Array.from(merged.values());
  await cart.save();
}

/**
 * Add item to cart. If productId/variantId already exists, increment quantity.
 */
async function addItem(userId, body) {
  const { productId, variantId, quantity } = body;
  const qty = Math.max(1, Number(quantity) || 1);
  if (!productId) {
    return { error: 'productId and quantity required' };
  }

  const snapshot = await resolveLineSnapshot(productId, variantId);
  if (snapshot.error) return snapshot;

  const {
    lineProductId,
    lineVariantId,
    variantSize,
    quantityPrice,
    originalPrice,
    productName,
    image,
    gstRate,
    catalogProduct,
  } = snapshot;

  await dedupeCartLines(userId);

  let cart = await Cart.findOne({ userId });
  const existingQty = cart
    ? Number(cart.items.find((it) => matchCartLine(it, lineProductId, lineVariantId))?.quantity) || 0
    : 0;

  const stockCheck = await assertStockAllowsAsync(catalogProduct, qty, existingQty, 'add');
  if (stockCheck.error) return { error: stockCheck.error };

  if (!cart) {
    cart = await Cart.create({
      userId,
      items: [{
        productId: new mongoose.Types.ObjectId(lineProductId),
        variantId: lineVariantId,
        variantSize,
        quantity: qty,
        price: quantityPrice,
        originalPrice,
        gstRate: gstRate || 0,
        productName,
        image,
      }],
    });
    await invalidateCartGetCache();
    return formatCartResponse(cart.toObject(), { userId });
  }

  const existing = cart.items.find((it) => matchCartLine(it, lineProductId, lineVariantId));
  if (existing) {
    existing.quantity = (Number(existing.quantity) || 0) + qty;
    if (!pickFirstString(existing.image) && pickFirstString(image)) {
      existing.image = image;
    }
  } else {
    cart.items.push({
      productId: new mongoose.Types.ObjectId(lineProductId),
      variantId: lineVariantId,
      variantSize,
      quantity: qty,
      price: quantityPrice,
      originalPrice,
      gstRate: gstRate || 0,
      productName,
      image,
    });
  }

  await cart.save();
  // Concurrent addItem races can create duplicate lines — collapse before responding.
  await dedupeCartLines(userId);
  await invalidateCartGetCache();
  const fresh = await Cart.findOne({ userId });
  return formatCartResponse((fresh || cart).toObject?.() ?? fresh ?? cart, { userId });
}

/**
 * Update cart item quantity by line-item id and/or productId + variantId (fallback when id missing on client).
 */
async function updateItem(userId, itemId, quantity, opts = {}) {
  const { productId, variantId } = opts;
  if (quantity == null || quantity < 0) return { error: 'Invalid quantity' };

  if (quantity === 0) {
    return removeItem(userId, itemId, opts);
  }

  const uid =
    userId instanceof mongoose.Types.ObjectId
      ? userId
      : mongoose.Types.ObjectId.isValid(String(userId))
        ? new mongoose.Types.ObjectId(String(userId))
        : null;
  if (!uid) return { error: 'Invalid user id' };

  // Resolve live product stock before mutating quantity.
  let productForStock = null;
  if (productId && mongoose.Types.ObjectId.isValid(String(productId))) {
    const snapshot = await resolveLineSnapshot(productId, variantId);
    if (!snapshot.error) productForStock = snapshot.catalogProduct;
  } else if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
    const existingCart = await Cart.findOne({ userId: uid }).lean();
    const line = existingCart?.items?.find((it) => String(it._id) === String(itemId));
    if (line?.productId) {
      productForStock = await Product.findById(line.productId).lean();
    }
  }
  if (productForStock) {
    const stockCheck = await assertStockAllowsAsync(productForStock, quantity, 0, 'set');
    if (stockCheck.error) return { error: stockCheck.error };
  }

  let filter = { userId: uid };
  let update = { $set: { 'items.$.quantity': quantity } };

  if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
    filter['items._id'] = new mongoose.Types.ObjectId(itemId);
  } else if (productId) {
    const cart = await Cart.findOne({ userId: uid }).lean();
    const line = await locateCartLine(cart, productId, variantId);
    if (!line) return { error: 'Item not found' };
    filter['items._id'] = line._id;
  } else {
    return { error: 'Item not found' };
  }

  let cart = await Cart.findOneAndUpdate(filter, update, { new: true }).lean();
  if (!cart && itemId && productId) {
    const existing = await Cart.findOne({ userId: uid }).lean();
    const line = await locateCartLine(existing, productId, variantId);
    if (line) {
      cart = await Cart.findOneAndUpdate(
        { userId, 'items._id': line._id },
        update,
        { new: true },
      ).lean();
    }
  }
  if (!cart) {
    return { error: 'Item not found' };
  }

  await invalidateCartGetCache();
  return formatCartResponse(cart, { userId });
}

/**
 * Remove one item from cart by item id, or by productId + variantId.
 */
async function removeItem(userId, itemId, opts = {}) {
  const { productId, variantId } = opts;
  const uid =
    userId instanceof mongoose.Types.ObjectId
      ? userId
      : mongoose.Types.ObjectId.isValid(String(userId))
        ? new mongoose.Types.ObjectId(String(userId))
        : null;
  if (!uid) return { error: 'Invalid user id' };

  const filter = { userId: uid };
  let pullQuery;

  if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
    pullQuery = { _id: new mongoose.Types.ObjectId(itemId) };
  } else if (productId) {
    const cart = await Cart.findOne({ userId: uid }).lean();
    const line = await locateCartLine(cart, productId, variantId);
    if (!line) return { error: 'Item not found' };
    pullQuery = { _id: line._id };
  } else {
    return { error: 'Item not found' };
  }

  const cart = await Cart.findOneAndUpdate(
    filter,
    { $pull: { items: pullQuery } },
    { new: true },
  ).lean();

  if (!cart) return { error: 'Cart not found' };

  await invalidateCartGetCache();
  return formatCartResponse(cart, { userId: uid });
}

/**
 * Clear all items in cart.
 */
async function clearCart(userId, session) {
  const uid = normalizeUserId(userId);
  const opts = session ? { session } : {};
  await Cart.findOneAndUpdate({ userId: uid }, { $set: { items: [] } }, { ...opts, upsert: true });
  if (!session) {
    await invalidateCartGetCache();
  }
  return { items: [], itemTotal: 0, discount: 0, deliveryFee: 0, handlingCharge: 0, tax: 0, total: 0 };
}

/** Cap of remembered merge idempotency keys per cart (oldest dropped first). */
const MAX_APPLIED_MERGE_KEYS = 20;

/**
 * Merge a guest cart into the authenticated user's server cart — exactly once.
 *
 * Business rule: quantities of the same product+variant are summed
 * (guest qty added on top of server qty); new products become new lines.
 *
 * Idempotency: `mergeKey` is a client-generated key persisted on the cart.
 * Replaying the same key (page refresh, retry, second tab) is a no-op that
 * returns the current cart, so a guest cart can never be applied twice.
 */
async function mergeGuestItems(userId, guestItems, mergeKey) {
  const uid = normalizeUserId(userId);
  const key = String(mergeKey || '').trim();
  if (!key) return { error: 'mergeKey required' };

  const list = (Array.isArray(guestItems) ? guestItems : [])
    .map((raw) => ({
      productId: String(raw?.productId || '').trim(),
      variantId: raw?.variantId != null ? String(raw.variantId).trim() : '',
      quantity: Math.floor(Number(raw?.quantity) || 0),
    }))
    .filter((it) => it.productId && it.quantity > 0);

  await dedupeCartLines(uid);

  // Ensure the cart document exists, then claim the merge key atomically.
  // Only ONE request can claim a given key — concurrent replays (second tab,
  // client retry) lose the claim and simply get the current cart back.
  await Cart.findOneAndUpdate(
    { userId: uid },
    { $setOnInsert: { items: [] } },
    { upsert: true, new: true },
  );
  const cart = await Cart.findOneAndUpdate(
    { userId: uid, appliedMergeKeys: { $ne: key } },
    { $push: { appliedMergeKeys: { $each: [key], $slice: -MAX_APPLIED_MERGE_KEYS } } },
    { new: true },
  );
  if (!cart) {
    // Key already applied — exactly-once replay: return the cart as-is.
    const current = await Cart.findOne({ userId: uid }).lean();
    return formatCartResponse(
      current || { items: [] },
      { userId: uid },
    );
  }

  const skipped = [];
  for (const guestLine of list) {
    const snapshot = await resolveLineSnapshot(guestLine.productId, guestLine.variantId);
    if (snapshot.error) {
      // Unknown/retired product in the guest cart must not fail the whole merge.
      skipped.push({ productId: guestLine.productId, reason: snapshot.error });
      continue;
    }

    const {
      lineProductId,
      lineVariantId,
      variantSize,
      quantityPrice,
      originalPrice,
      productName,
      image,
      gstRate,
      catalogProduct,
    } = snapshot;

    const existing = cart.items.find((it) => matchCartLine(it, lineProductId, lineVariantId));
    const existingQty = Number(existing?.quantity) || 0;

    // Cap merged quantity at live sellable stock AND Master Sheet MaxOrderLimit.
    const available = await resolveAvailableStockForProductSafe(catalogProduct);
    if (!isProductPurchasable(catalogProduct, available) || available <= 0) {
      skipped.push({ productId: guestLine.productId, reason: 'Out of stock' });
      continue;
    }
    const maxOrder = resolveMaxOrderLimit(catalogProduct);
    const purchasableCap =
      maxOrder != null ? Math.min(available, maxOrder) : available;
    const desired = existingQty + guestLine.quantity;
    const target = Math.min(desired, purchasableCap);
    if (target <= existingQty) {
      if (desired > existingQty) {
        skipped.push({
          productId: guestLine.productId,
          reason:
            maxOrder != null && desired > maxOrder
              ? `Maximum order limit reached. You can order only ${maxOrder} units of this product.`
              : 'Stock limit reached',
        });
      }
      continue;
    }

    if (existing) {
      existing.quantity = target;
      if (!pickFirstString(existing.image) && pickFirstString(image)) {
        existing.image = image;
      }
    } else {
      cart.items.push({
        productId: new mongoose.Types.ObjectId(lineProductId),
        variantId: lineVariantId,
        variantSize,
        quantity: target,
        price: quantityPrice,
        originalPrice,
        gstRate: gstRate || 0,
        productName,
        image,
      });
    }
  }

  // mergeKey was already claimed atomically above — only persist the items.
  await cart.save();
  await dedupeCartLines(uid);
  await clampCartToMaxOrderLimits(uid);
  await invalidateCartGetCache();

  const fresh = await Cart.findOne({ userId: uid }).lean();
  const response = await formatCartResponse(fresh || cart.toObject(), { userId: uid });
  if (skipped.length > 0) response.skippedItems = skipped;
  return response;
}

/** Live stock lookup that degrades to catalog stock if StoreInventory query fails. */
async function resolveAvailableStockForProductSafe(product) {
  try {
    return await resolveAvailableStockForProduct(product);
  } catch {
    return resolveAvailableStock(product);
  }
}

/**
 * Replace server cart with line items from a customer order (e.g. after failed online payment).
 */
function mapOrderItemsToCartItems(orderItems) {
  return (orderItems || []).map((it) => ({
    productId: new mongoose.Types.ObjectId(it.productId),
    variantId: it.variantId || '',
    variantSize: it.variantSize || '',
    quantity: it.quantity,
    price: it.price,
    originalPrice: it.originalPrice ?? it.price,
    gstRate: it.gstRate || 0,
    productName: it.productName || '',
    image: it.image || '',
  }));
}

async function restoreCartFromOrder(userId, order) {
  const uid = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  // Exactly-once: claim the restore on the order document. Failed-payment
  // handling can be replayed (gateway return + webhook + reconciliation job +
  // order-list reconcile); without this claim every replay would re-insert
  // the old order's items into the customer's current cart.
  const { Order } = require('../models/Order');
  const claim = await Order.updateOne(
    { _id: order._id, cartRestoredAt: null },
    { $set: { cartRestoredAt: new Date() } },
  );
  if (claim.modifiedCount !== 1) {
    return { ok: true, skipped: true };
  }

  // Merge into the live cart instead of replacing it: the restore can run
  // minutes after checkout (webhook / reconciliation job), and the customer
  // may have added new items since. Existing lines win; only order lines the
  // cart does not already contain are added back.
  const restoredItems = mapOrderItemsToCartItems(order.items || []);
  const cart = await Cart.findOneAndUpdate(
    { userId: uid },
    { $setOnInsert: { items: [] } },
    { upsert: true, new: true },
  );
  for (const line of restoredItems) {
    const exists = cart.items.some((it) => matchCartLine(it, line.productId, line.variantId));
    if (!exists) cart.items.push(line);
  }
  await cart.save();
  await dedupeCartLines(uid);
  await invalidateCartGetCache();
  return { ok: true };
}

module.exports = {
  getCartForUser,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  mergeGuestItems,
  restoreCartFromOrder,
  invalidateCartGetCache,
  matchCartLine,
  dedupeCartLines,
};
