const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../core/middleware');
const { PERMISSIONS } = require('../../config/permissions');
const interWarehouseController = require('../controllers/interWarehouseController');

router.get(
  '/',
  requirePermission(PERMISSIONS.WAREHOUSE_TRANSFER_READ),
  interWarehouseController.getTransfers
);
router.post(
  '/',
  requirePermission(PERMISSIONS.WAREHOUSE_TRANSFER_CREATE),
  interWarehouseController.requestTransfer
);
router.get(
  '/export',
  requirePermission(PERMISSIONS.WAREHOUSE_TRANSFER_READ),
  interWarehouseController.exportTransfers
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.WAREHOUSE_TRANSFER_READ),
  interWarehouseController.getTransferDetails
);
router.put(
  '/:id/status',
  requirePermission(PERMISSIONS.WAREHOUSE_TRANSFER_APPROVE),
  interWarehouseController.updateStatus
);
router.get(
  '/:id/track',
  requirePermission(PERMISSIONS.WAREHOUSE_TRANSFER_READ),
  interWarehouseController.getTracking
);

module.exports = router;

