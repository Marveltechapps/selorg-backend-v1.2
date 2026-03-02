const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.get('/', orderController.listOrders);
router.post('/:orderId/assign', orderController.assignOrder);
router.post('/:orderId/alert', orderController.alertOrder);

module.exports = router;
