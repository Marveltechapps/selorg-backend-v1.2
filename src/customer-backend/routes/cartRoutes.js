const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clear,
} = require('../controllers/cartController');

const router = Router();
router.get('/', auth, getCart);
router.post('/items', auth, addCartItem);
router.put('/items/:itemId', auth, updateCartItem);
router.delete('/items/:itemId', auth, removeCartItem);
router.delete('/clear', auth, clear);

module.exports = router;
