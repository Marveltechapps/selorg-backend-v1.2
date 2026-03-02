const express = require('express');
const citywideController = require('../controllers/citywideController');

const router = express.Router();

router.get('/live-metrics', citywideController.getLiveMetrics);
router.get('/zones', citywideController.getZones);
router.get('/zones/:id/trend', citywideController.getZoneOrderTrend);
router.get('/zones/:id', citywideController.getZoneDetail);
router.get('/incidents', citywideController.getIncidents);
router.get('/incidents/:id', citywideController.getIncidentById);
router.patch('/incidents/:id', citywideController.updateIncident);
router.get('/exceptions', citywideController.getExceptions);
router.post('/exceptions/:id/resolve', citywideController.resolveException);
router.get('/integration-health', citywideController.getIntegrationHealth);
router.get('/surge', citywideController.getSurge);
router.put('/surge', citywideController.updateSurge);
router.delete('/surge', citywideController.endSurge);
router.post('/dispatch/restart', citywideController.restartDispatch);
router.get('/dispatch', citywideController.getDispatch);
router.patch('/dispatch', citywideController.updateDispatch);
router.get('/sla', citywideController.getSla);
router.post('/seed', citywideController.seedCitywide);

module.exports = router;
