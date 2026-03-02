const express = require('express');
const router = express.Router();
const fraudController = require('../controllers/fraudController');
const { asyncHandler } = require('../../core/middleware');

router.get('/alerts', asyncHandler(fraudController.listAlerts));
router.get('/alerts/:id', asyncHandler(fraudController.getAlert));
router.patch('/alerts/:id', asyncHandler(fraudController.updateAlert));

router.get('/blocked', asyncHandler(fraudController.listBlockedEntities));
router.post('/blocked', asyncHandler(fraudController.createBlockedEntity));
router.delete('/blocked/:id', asyncHandler(fraudController.unblockEntity));

router.get('/rules', asyncHandler(fraudController.listFraudRules));
router.patch('/rules/:id/toggle', asyncHandler(fraudController.toggleFraudRule));

router.get('/risk-profiles', asyncHandler(fraudController.listRiskProfiles));
router.get('/patterns', asyncHandler(fraudController.listFraudPatterns));
router.get('/investigations', asyncHandler(fraudController.listInvestigations));

router.get('/chargebacks', asyncHandler(fraudController.listChargebacks));
router.patch('/chargebacks/:id', asyncHandler(fraudController.updateChargeback));

router.get('/metrics', asyncHandler(fraudController.getMetrics));

module.exports = router;
