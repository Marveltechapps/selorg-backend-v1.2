const mongoose = require('mongoose');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');
const { calculatePricing, compareWithLegacy } = require('./pricingEngineService');

const usePricingEngine = true;

/**
 * Get cart for user; return shape expected by app.
 * Supports optional pricing context (coupon/zone/payment) for parity with createOrder.
 */
async function getCartForUser(userId, options = {}) {
  const cart = await Cart.findOne({ userId }).lean();
  if (!cart || !cart.items || cart.items.length === 0) {
    return { items: [], itemTotal: 0, discount: 0, deliveryFee: 0, handlingCharge: 0, tax: 0, total: 0 };
  }
  return formatCartResponse(cart, { userId, ...options });
}

function matchCartLine(it, productId, variantId) {
  return (
    String(it.productId) === String(productId) && String(it.variantId || '') === String(variantId ?? '')
  );
}

/**
 * Find a cart line by Mongo subdocument id, or by product + variant (when id missing on client).
 */
function findCartLine(cart, itemId, productId, variantId) {
  if (itemId) {
    const byId = cart.items.id(itemId);
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
    variantId: it.variantId || '',
    variantSize: it.variantSize || '',
    quantity: it.quantity,
    price: it.price,
    originalPrice: it.originalPrice,
    gstRate: it.gstRate || 0,
    image: it.image || '',
  }));
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

/**
 * Add item to cart. If productId/variantId already exists, increment quantity.
 */
async function addItem(userId, body) {
  const { productId, variantId, quantity } = body;
  if (!productId || quantity == null || quantity < 1) {
    return { error: 'productId and quantity required' };
  }
  const product = await Product.findById(productId).lean();
  if (!product) return { error: 'Product not found' };

  let variant = null;
  if (product.variants && product.variants.length) {
    variant = product.variants.find((v) => String(v._id) === String(variantId)) || product.variants[0];
  }
  const price = variant ? (variant.price ?? product.price) : product.price;
  const originalPrice = variant ? variant.originalPrice : product.originalPrice;
  const variantSize = variant ? variant.size : '';
  const image = (product.images && product.images[0]) || '';

  // 1. Try to increment quantity if item already exists in cart
  const cart = await Cart.findOneAndUpdate(
    {
      userId,
      'items.productId': new mongoose.Types.ObjectId(productId),
      'items.variantId': variantId || '',
    },
    { $inc: { 'items.$.quantity': quantity } },
    { new: true }
  ).lean();

  if (cart) {
    return formatCartResponse(cart, { userId });
  }

  // 2. Item not in cart, push new item
  const newItem = {
    productId: new mongoose.Types.ObjectId(productId),
    variantId: variantId || '',
    variantSize,
    quantity,
    price,
    originalPrice,
    gstRate: product.gstRate || 0,
    productName: product.name,
    image,
  };

  const updatedCart = await Cart.findOneAndUpdate(
    { userId },
    { $push: { items: newItem } },
    { upsert: true, new: true }
  ).lean();

  return formatCartResponse(updatedCart, { userId });
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
    filter['items.productId'] = new mongoose.Types.ObjectId(productId);
    filter['items.variantId'] = variantId || '';
  } else {
    return { error: 'Item not found' };
  }

  const cart = await Cart.findOneAndUpdate(filter, update, { new: true }).lean();
  if (!cart) {
    // If we used itemId and it failed, try fallback to productId+variantId if available
    if (itemId && productId) {
      const fallbackFilter = {
        userId,
        'items.productId': new mongoose.Types.ObjectId(productId),
        'items.variantId': variantId || '',
      };
      const fallbackCart = await Cart.findOneAndUpdate(fallbackFilter, update, { new: true }).lean();
      if (fallbackCart) return formatCartResponse(fallbackCart, { userId });
    }
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
    pullQuery = {
      productId: new mongoose.Types.ObjectId(productId),
      variantId: variantId || '',
    };
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
