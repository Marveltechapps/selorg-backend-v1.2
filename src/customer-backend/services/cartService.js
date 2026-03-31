const mongoose = require('mongoose');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');

/**
 * Get cart for user; return shape expected by app (items, itemTotal, discount, deliveryFee, total).
 */
async function getCartForUser(userId) {
  const cart = await Cart.findOne({ userId }).lean();
  if (!cart || !cart.items || cart.items.length === 0) {
    return { items: [], itemTotal: 0, discount: 0, deliveryFee: 0, total: 0 };
  }
  return formatCartResponse(cart);
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

function formatCartResponse(cart) {
  const items = (cart.items || []).map((it) => ({
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
  const itemTotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const deliveryFee = 0;
  const discount = 0;
  const total = itemTotal + deliveryFee - discount;
  return {
    items,
    itemTotal,
    discount,
    deliveryFee,
    total,
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
    return formatCartResponse(cart);
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

  return formatCartResponse(updatedCart);
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
      if (fallbackCart) return formatCartResponse(fallbackCart);
    }
    return { error: 'Item not found' };
  }

  return formatCartResponse(cart);
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

  return formatCartResponse(cart);
}

/**
 * Clear all items in cart.
 */
async function clearCart(userId) {
  await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });
  return { items: [], itemTotal: 0, discount: 0, deliveryFee: 0, total: 0 };
}

module.exports = {
  getCartForUser,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};
