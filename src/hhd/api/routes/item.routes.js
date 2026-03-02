const express = require('express');
const {
  getOrderItems,
  scanItem,
  getSubstitutes,
  markItemNotFound,
  updateItem,
} = require('../controllers/item.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();
router.use(protect);
router.get('/order/:orderId', getOrderItems);
router.get('/substitutes', getSubstitutes);
router.post('/scan', scanItem);
router.put('/:itemId/not-found', markItemNotFound);
router.put('/:itemId', updateItem);
module.exports = router;
