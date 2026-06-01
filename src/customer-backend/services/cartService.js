const mongoose = require('mongoose');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');
const { calculatePricing, compareWithLegacy } = require('./pricingEngineService');
const { pickFirstNonStubString } = require('../utils/mediaUrl');

const usePricingEngine = true;

/**
 * Get cart for user; return shape expected by app.
 * Supports optional pricing context (coupon/zone/payment) for parity with createOrder.
 */
async function getCartForUser(userId, options = {}) {
  await dedupeCartLines(userId);
  const cart = await Cart.findOne({ userId }).lean();
  if (!cart || !cart.items || cart.items.length === 0) {
    return { items: [], itemTotal: 0, discount: 0, deliveryFee: 0, handlingCharge: 0, tax: 0, total: 0 };
  }
  return formatCartResponse(cart, { userId, ...options });
}

/** Stable cart line key — empty variantId and productId-only SKUs must match. */
function normalizeVariantId(productId, variantId) {
  const pid = String(productId || '').trim();
  const vid = variantId != null ? String(variantId).trim() : '';
  if (!vid || vid === pid) return pid;
  return vid;
}

function matchCartLine(it, productId, variantId) {
  const pid = String(productId);
  const vid = normalizeVariantId(productId, variantId);
  const lineVid = normalizeVariantId(it.productId, it.variantId);
  return String(it.productId) === pid && lineVid === vid;
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

  return {
    lineProductId,
    lineVariantId,
    variantSize,
    quantityPrice: price,
    originalPrice,
    productName,
    image,
    gstRate,
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
  } = snapshot;

  await dedupeCartLines(userId);

  let cart = await Cart.findOne({ userId });
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
  return formatCartResponse(cart.toObject(), { userId });
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

  let filter = { userId };
  let update = { $set: { 'items.$.quantity': quantity } };

  if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
    filter['items._id'] = new mongoose.Types.ObjectId(itemId);
  } else if (productId) {
    const cart = await Cart.findOne({ userId }).lean();
    const line = findCartLine(cart, null, productId, variantId);
    if (!line) return { error: 'Item not found' };
    filter['items._id'] = line._id;
  } else {
    return { error: 'Item not found' };
  }

  let cart = await Cart.findOneAndUpdate(filter, update, { new: true }).lean();
  if (!cart && itemId && productId) {
    const existing = await Cart.findOne({ userId }).lean();
    const line = findCartLine(existing, null, productId, variantId);
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

  return formatCartResponse(cart, { userId });
}

/**
 * Remove one item from cart by item id, or by productId + variantId.
 */
async function removeItem(userId, itemId, opts = {}) {
  const { productId, variantId } = opts;
  let filter = { userId };
  let pullQuery;

  if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
    pullQuery = { _id: new mongoose.Types.ObjectId(itemId) };
  } else if (productId) {
    const cart = await Cart.findOne({ userId }).lean();
    const line = findCartLine(cart, null, productId, variantId);
    if (!line) {
      return formatCartResponse(cart || { items: [] }, { userId });
    }
    pullQuery = { _id: line._id };
  } else {
    return { error: 'Item not found' };
  }

  const cart = await Cart.findOneAndUpdate(
    filter,
    { $pull: { items: pullQuery } },
    { new: true }
  ).lean();

  if (!cart) return { error: 'Cart not found' };

  return formatCartResponse(cart, { userId });
}

/**
 * Clear all items in cart.
 */
async function clearCart(userId) {
  await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });
  return { items: [], itemTotal: 0, discount: 0, deliveryFee: 0, handlingCharge: 0, tax: 0, total: 0 };
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
  const items = mapOrderItemsToCartItems(order.items || []);
  await Cart.findOneAndUpdate(
    { userId: uid },
    { $set: { items } },
    { upsert: true, new: true }
  );
  return { ok: true };
}

module.exports = {
  getCartForUser,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  restoreCartFromOrder,
};
