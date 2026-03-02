const {
  getCartForUser,
  addItem,
  updateItem,
  removeItem,
  clearCart,
} = require('../services/cartService');

async function getCart(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await getCartForUser(userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('cart getCart error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function addCartItem(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const result = await addItem(userId, req.body);
    if (result.error) {
      res.status(400).json({ success: false, message: result.error });
      return;
    }
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('cart addItem error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updateCartItem(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const result = await updateItem(userId, req.params.itemId, req.body.quantity);
    if (result.error) {
      const status = result.error === 'Item not found' || result.error === 'Cart not found' ? 404 : 400;
      res.status(status).json({ success: false, message: result.error });
      return;
    }
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('cart updateItem error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function removeCartItem(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const result = await removeItem(userId, req.params.itemId);
    if (result.error) {
      res.status(404).json({ success: false, message: result.error });
      return;
    }
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('cart removeItem error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function clear(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await clearCart(userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('cart clear error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getCart, addCartItem, updateCartItem, removeCartItem, clear };
