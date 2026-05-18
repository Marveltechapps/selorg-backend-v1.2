const express = require('express');
const { requirePermission } = require('../../core/middleware');
const { PERMISSIONS } = require('../../config/permissions');
const AllocationController = require('../controllers/allocationController');

const router = express.Router();

// Specific paths before `/:id` to avoid param shadowing (e.g. "alerts" captured as id)
router.route('/sku/:skuId/history').get(
  requirePermission(PERMISSIONS.MERCH_ALLOCATION_READ),
  AllocationController.getAllocationHistory
);

router.route('/').get(
  requirePermission(PERMISSIONS.MERCH_ALLOCATION_READ),
  AllocationController.getAllocations
);

router.route('/alerts')
  .get(requirePermission(PERMISSIONS.MERCH_ALLOCATION_READ), AllocationController.getAlerts)
  .post(requirePermission(PERMISSIONS.MERCH_ALLOCATION_WRITE), AllocationController.createAlert);

router.route('/alerts/:id').put(
  requirePermission(PERMISSIONS.MERCH_ALLOCATION_WRITE),
  AllocationController.updateAlertStatus
);

router.route('/transfers').post(
  requirePermission(PERMISSIONS.WAREHOUSE_TRANSFER_CREATE),
  AllocationController.createTransferOrder
);

router.route('/rebalance').post(
  requirePermission(PERMISSIONS.MERCH_ALLOCATION_WRITE),
  AllocationController.rebalanceAllocations
);

router.route('/rebalance/auto').post(
  requirePermission(PERMISSIONS.MERCH_ALLOCATION_WRITE),
  AllocationController.autoRebalance
);

router.route('/seed').post(
  requirePermission(PERMISSIONS.MERCH_ALLOCATION_WRITE),
  AllocationController.seedAllocationData
);

router.route('/:id').put(
  requirePermission(PERMISSIONS.MERCH_ALLOCATION_WRITE),
  AllocationController.updateAllocation
);

module.exports = router;
