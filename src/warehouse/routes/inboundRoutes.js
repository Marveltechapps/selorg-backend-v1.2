const express = require('express');
const router = express.Router();
const inboundController = require('../controllers/inboundController');

/**
 * @desc Inbound Operations Routes
 */

// GRN Management
router.get('/grns', inboundController.getGRNs);
router.post('/grns', inboundController.createGRN);
router.get('/grns/export', inboundController.exportGRNs);

router.get('/grns/:id', inboundController.getGRNDetails);
router.post('/grns/:id/start', inboundController.startGRNCounting);
router.post('/grns/:id/complete', inboundController.completeGRN);
router.post('/grns/:id/discrepancy', inboundController.logGRNDiscrepancy);

// Dock Management
router.get('/docks', inboundController.getDocks);
router.put('/docks/:id', inboundController.updateDock);

module.exports = router;

