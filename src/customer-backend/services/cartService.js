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

  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }

  const existing = cart.items.find(
    (it) => String(it.productId) === String(productId) && String(it.variantId || '') === String(variantId || '')
  );
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({
      productId: new mongoose.Types.ObjectId(productId),
      variantId: variantId || '',
      variantSize,
      quantity,
      price,
      originalPrice,
      productName: product.name,
      image,
    });
  }
  await cart.save();
  const populated = await Cart.findOne({ userId }).lean();
  return formatCartResponse(populated);
}

/**
 * Update cart item quantity by item id (cart item _id).
 */
async function updateItem(userId, itemId, quantity) {
  if (quantity == null || quantity < 0) return { error: 'Invalid quantity' };
  const cart = await Cart.findOne({ userId });
  if (!cart) return { error: 'Cart not found' };
  const item = cart.items.id(itemId);
  if (!item) return { error: 'Item not found' };
  if (quantity === 0) {
    item.remove();
  } else {
    item.quantity = quantity;
  }
  await cart.save();
  const populated = await Cart.findOne({ userId }).lean();
  return formatCartResponse(populated);
}

/**
 * Remove one item from cart by item id.
 */
async function removeItem(userId, itemId) {
  const cart = await Cart.findOne({ userId });
  if (!cart) return { error: 'Cart not found' };
  const item = cart.items.id(itemId);
  if (!item) return { error: 'Item not found' };
  item.remove();
  await cart.save();
  const populated = await Cart.findOne({ userId }).lean();
  return formatCartResponse(populated);
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
