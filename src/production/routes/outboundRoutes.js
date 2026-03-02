const express = require('express');
const router = express.Router();
const {
  getOutboundSummary,
  getDispatchQueue,
  getActiveRiders,
  batchDispatchOrders,
  manuallyAssignRider,
  getOutboundTransferRequests,
  approveTransferRequest,
  rejectTransferRequest,
  getTransferFulfillmentStatus,
  getTransferSLASummary,
} = require('../controllers/outboundController');

// GET /api/darkstore/outbound/summary
router.get('/summary', getOutboundSummary);

// GET /api/darkstore/outbound/dispatch
router.get('/dispatch', getDispatchQueue);

// GET /api/darkstore/outbound/riders
router.get('/riders', getActiveRiders);

// POST /api/darkstore/outbound/dispatch/batch
router.post('/dispatch/batch', batchDispatchOrders);

// POST /api/darkstore/outbound/dispatch/assign
router.post('/dispatch/assign', manuallyAssignRider);

// GET /api/darkstore/outbound/transfers
router.get('/transfers', getOutboundTransferRequests);

// POST /api/darkstore/outbound/transfers/:requestId/approve
router.post('/transfers/:requestId/approve', approveTransferRequest);

// POST /api/darkstore/outbound/transfers/:requestId/reject
router.post('/transfers/:requestId/reject', rejectTransferRequest);

// GET /api/darkstore/outbound/transfers/:requestId/fulfillment
router.get('/transfers/:requestId/fulfillment', getTransferFulfillmentStatus);

// GET /api/darkstore/outbound/transfers/sla-summary
router.get('/transfers/sla-summary', getTransferSLASummary);

module.exports = router;

