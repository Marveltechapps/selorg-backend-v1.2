const express = require('express');
const router = express.Router();
const {
  getInboundSummary,
  getGRNList,
  getGRNDetails,
  startGRNProcessing,
  updateGRNItemQuantity,
  completeGRNProcessing,
  getPutawayTasks,
  assignPutawayTask,
  completePutawayTask,
  getInterStoreTransfers,
  receiveInterStoreTransfer,
  syncInterStoreTransfers,
} = require('../controllers/inboundController');

// GET /api/darkstore/inbound/summary
router.get('/summary', getInboundSummary);

// GET /api/darkstore/inbound/grn
router.get('/grn', getGRNList);

// POST /api/darkstore/inbound/grn/:grnId/start (must come before /grn/:grnId)
router.post('/grn/:grnId/start', startGRNProcessing);

// PUT /api/darkstore/inbound/grn/:grnId/items/:sku (must come before /grn/:grnId)
router.put('/grn/:grnId/items/:sku', updateGRNItemQuantity);

// POST /api/darkstore/inbound/grn/:grnId/complete (must come before /grn/:grnId)
router.post('/grn/:grnId/complete', completeGRNProcessing);

// GET /api/darkstore/inbound/grn/:grnId (must come after specific routes)
router.get('/grn/:grnId', getGRNDetails);

// GET /api/darkstore/inbound/putaway
router.get('/putaway', getPutawayTasks);

// POST /api/darkstore/inbound/putaway/:taskId/assign
router.post('/putaway/:taskId/assign', assignPutawayTask);

// POST /api/darkstore/inbound/putaway/:taskId/complete
router.post('/putaway/:taskId/complete', completePutawayTask);

// GET /api/darkstore/inbound/transfers
router.get('/transfers', getInterStoreTransfers);

// POST /api/darkstore/inbound/transfers/sync
router.post('/transfers/sync', syncInterStoreTransfers);

// POST /api/darkstore/inbound/transfers/:transferId/receive
router.post('/transfers/:transferId/receive', receiveInterStoreTransfer);

module.exports = router;

