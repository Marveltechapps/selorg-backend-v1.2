const express = require('express');
const router = express.Router();
const interWarehouseController = require('../controllers/interWarehouseController');

router.get('/', interWarehouseController.getTransfers);
router.post('/', interWarehouseController.requestTransfer);
router.get('/export', interWarehouseController.exportTransfers);

router.get('/:id', interWarehouseController.getTransferDetails);
router.put('/:id/status', interWarehouseController.updateStatus);
router.get('/:id/track', interWarehouseController.getTracking);

module.exports = router;

