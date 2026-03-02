const express = require('express');
const router = express.Router();
const inboundController = require('../controllers/inboundController');
const { requireAuth } = require('../../core/middleware');

router.get('/overview', inboundController.getOverview);
router.get('/grns', inboundController.listGRNs);
router.post('/grns', inboundController.createGRN);
router.get('/grns/:grnId', inboundController.getGRN);
router.put('/grns/:grnId', inboundController.putGRN);
router.patch('/grns/:grnId/status', inboundController.patchGRNStatus);
router.post('/grns/:grnId/approve', inboundController.approveGRN);
router.post('/grns/:grnId/reject', inboundController.rejectGRN);

router.get('/shipments', inboundController.listShipments);
router.post('/shipments', inboundController.createShipment);
router.patch('/shipments/:shipmentId/status', inboundController.patchShipmentStatus);

router.get('/exceptions', inboundController.listExceptions);
router.post('/exceptions', inboundController.createException);
router.post('/exceptions/:exceptionId/resolve', inboundController.resolveException);

router.post('/bulk-import', requireAuth, inboundController.createImportJob);
router.get('/bulk-import/:jobId', async (req, res) => res.json({ id: req.params.jobId, status: 'PROCESSING' }));

router.get('/report', async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.send('id,example\n1,report');
});

module.exports = router;

