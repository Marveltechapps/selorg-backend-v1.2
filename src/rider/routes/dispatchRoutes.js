const express = require('express');
const router = express.Router();
const dispatchController = require('../controllers/dispatchController');
const appConfig = require('../../config/app');
const { validateAutoAssign } = require('../../middleware/validator');

// Conditional auto-assign validation middleware
// Skip validation in development mode, enforce in production
const conditionalValidateAutoAssign = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next() // Skip validation in development
  : validateAutoAssign; // Apply validation in production

// Unassigned Orders Endpoints
router.get('/unassigned-orders', dispatchController.listUnassignedOrders);
router.get('/unassigned-orders/count', dispatchController.getUnassignedOrdersCount);

// Map Data Endpoints
router.get('/map-data', dispatchController.getMapData);
router.get('/map-data/riders', dispatchController.getMapRiders);
router.get('/map-data/orders', dispatchController.getMapOrders);

// Rider Recommendations
router.get('/recommended-riders/:orderId', dispatchController.getRecommendedRiders);

// Order Assignment Details
router.get('/order/:orderId/assignment-details', dispatchController.getOrderAssignmentDetails);

// Order Assignment Endpoints
router.post('/assign', dispatchController.assignOrder);
router.post('/batch-assign', dispatchController.batchAssignOrders);
router.post('/auto-assign', conditionalValidateAutoAssign, dispatchController.autoAssignOrders);

// Manual Order Creation
router.post('/manual-order', dispatchController.createManualOrder);

// Auto-assign Rules (GET/PUT)
router.get('/auto-assign-rules', dispatchController.getAutoAssignRules);
router.put('/auto-assign-rules', dispatchController.updateAutoAssignRule);

module.exports = router;
