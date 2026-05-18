'use strict';

const express = require('express');
const logisticsOrders = require('../controllers/logisticsOrders.controller');
const { validateBody, validateQuery } = require('../middleware/validateZod.middleware');
const { createOrderBody, listOrdersQuery } = require('../validators/order.zod');

const router = express.Router();

router.post('/', validateBody(createOrderBody), logisticsOrders.createOrder);
router.get('/', validateQuery(listOrdersQuery), logisticsOrders.listOrders);
router.get('/:id', logisticsOrders.getOrder);
router.post('/:id/cancel', logisticsOrders.cancelOrder);
router.get('/:id/tracking', logisticsOrders.getTracking);

module.exports = router;
