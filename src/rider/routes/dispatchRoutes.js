const express = require('express');
const router = express.Router();
const dispatchController = require('../controllers/dispatchController');
const appConfig = require('../../config/app');
const { validateAutoAssign } = require('../../middleware/validator');
const { authenticateToken, requireRole } = require('../../core/middleware');
const { requireRiderOpsPermission } = require('../middleware/riderOpsPermissions');

const conditionalValidateAutoAssign = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next()
  : validateAutoAssign;

const fleetAuth = [authenticateToken, requireRole('rider', 'admin', 'super_admin')];

router.use(...fleetAuth);

// Unassigned Orders Endpoints
router.get('/unassigned-orders', dispatchController.listUnassignedOrders);
router.get('/unassigned-orders/count', dispatchController.getUnassignedOrdersCount);
router.get('/group-delivery', dispatchController.groupOrders);
router.get('/group-delivery/orders', dispatchController.listGroupDeliveryOrders);
router.get('/group-delivery/filter-options', dispatchController.getGroupDeliveryFilterOptions);
router.post('/clusters/compute-metrics', dispatchController.computeClusterMetrics);

// Cluster Management
router.get('/clusters', dispatchController.listClusters);
router.post('/clusters', requireRiderOpsPermission('dispatch.assign'), dispatchController.saveClusters);
router.patch('/clusters/:clusterId/orders', requireRiderOpsPermission('dispatch.assign'), dispatchController.updateClusterOrders);
router.delete('/clusters/:clusterId', requireRiderOpsPermission('dispatch.assign'), dispatchController.deleteCluster);
router.post('/clusters/:clusterId/assign', requireRiderOpsPermission('dispatch.assign'), dispatchController.assignCluster);

// Map Data Endpoints
router.get('/map-data', dispatchController.getMapData);
router.get('/map-data/riders', dispatchController.getMapRiders);
router.get('/map-data/orders', dispatchController.getMapOrders);

// Rider Recommendations
router.get('/recommended-riders/:orderId', dispatchController.getRecommendedRiders);

// Order Assignment Details
router.get('/order/:orderId/assignment-details', dispatchController.getOrderAssignmentDetails);

// Order Assignment Endpoints
router.post('/assign', requireRiderOpsPermission('dispatch.assign'), dispatchController.assignOrder);
router.post('/batch-assign', requireRiderOpsPermission('dispatch.assign'), dispatchController.batchAssignOrders);
router.post('/auto-assign', requireRiderOpsPermission('dispatch.auto_assign'), conditionalValidateAutoAssign, dispatchController.autoAssignOrders);
router.post('/auto-assign/simulate', requireRiderOpsPermission('dispatch.auto_assign'), dispatchController.simulateAutoAssign);

// Manual Order Creation
router.post('/manual-order', requireRiderOpsPermission('dispatch.assign'), dispatchController.createManualOrder);

// Auto-assign Rules (GET/PUT)
router.get('/auto-assign-rules', dispatchController.getAutoAssignRules);
router.put('/auto-assign-rules', requireRiderOpsPermission('dispatch.auto_assign'), dispatchController.updateAutoAssignRule);

module.exports = router;
