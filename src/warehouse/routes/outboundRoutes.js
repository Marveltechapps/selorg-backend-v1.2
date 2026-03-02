const express = require('express');
const router = express.Router();
const outboundController = require('../controllers/outboundController');

/**
 * @desc Outbound Operations Routes
 */

// Picklist Management
router.get('/picklists', outboundController.getPicklists);
router.get('/picklists/:id', outboundController.getPicklistDetails);
router.post('/picklists/:id/assign', outboundController.assignPicker);

// Batch Management
router.get('/batches', outboundController.listBatches);
router.post('/batches', outboundController.createBatch);
router.get('/batches/:id', outboundController.getBatchDetails);

// Picker Management
router.get('/pickers', outboundController.getPickers);
router.get('/pickers/:id/orders', outboundController.getPickerOrders);

// Route Optimization
router.get('/routes/active/map', outboundController.getActiveRoutes);
router.get('/routes/:id/map', outboundController.getRouteMap);

// Consolidated Picks (Multi-order)
router.get('/consolidated-picks', outboundController.getConsolidatedPicks);

module.exports = router;

