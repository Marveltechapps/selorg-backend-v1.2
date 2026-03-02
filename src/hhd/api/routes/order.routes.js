const express = require('express');
const {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  getOrdersByStatus,
  getAssignOrdersByStatus,
  updateAssignOrderStatus,
  getCompletedOrders,
} = require('../controllers/order.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();
router.use(protect);
router.route('/').get(getOrders).post(createOrder);
router.get('/status/:status', getOrdersByStatus);
router.get('/completed', getCompletedOrders);
router.get('/assignorders/status/:status', getAssignOrdersByStatus);
router.put('/assignorders/:orderId/status', updateAssignOrderStatus);
router.get('/:orderId', getOrder);
router.put('/:orderId/status', updateOrderStatus);
module.exports = router;
