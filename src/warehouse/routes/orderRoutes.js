const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const appConfig = require('../../config/app');
const {
  validateOrderId,
  validateAssignOrder,
  validateAlertOrder,
} = require('../../middleware/validator');

// Conditional order ID validation middleware
// Skip validation in development mode, enforce in production
const conditionalValidateOrderId = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next() // Skip validation in development
  : validateOrderId; // Apply validation in production

// Conditional assign order validation middleware
// Skip validation in development mode, enforce in production
const conditionalValidateAssignOrder = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next() // Skip validation in development
  : validateAssignOrder; // Apply validation in production

// Conditional alert order validation middleware
// Skip validation in development mode, enforce in production
const conditionalValidateAlertOrder = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next() // Skip validation in development
  : validateAlertOrder; // Apply validation in production

// GET /orders - List orders
router.get('/', orderController.listOrders);

// POST /orders/:orderId/assign - Assign order to rider
router.post('/:orderId/assign', conditionalValidateOrderId, conditionalValidateAssignOrder, orderController.assignOrder);

// POST /orders/:orderId/alert - Raise alert for order
router.post('/:orderId/alert', conditionalValidateOrderId, conditionalValidateAlertOrder, orderController.alertOrder);

module.exports = router;

