const express = require('express');
const {
  getAllocations,
  updateAllocation,
  getAlerts,
  createAlert,
  updateAlertStatus,
  seedAllocationData,
  createTransferOrder,
  rebalanceAllocations,
  autoRebalance,
  getAllocationHistory
} = require('../controllers/allocationController');

const router = express.Router();

router.route('/sku/:skuId/history')
  .get(getAllocationHistory);

router.route('/')
  .get(getAllocations);

router.route('/:id')
  .put(updateAllocation);

router.route('/alerts')
  .get(getAlerts)
  .post(createAlert);

router.route('/alerts/:id')
  .put(updateAlertStatus);

router.route('/transfers')
  .post(createTransferOrder);

router.route('/rebalance')
  .post(rebalanceAllocations);

router.route('/rebalance/auto')
  .post(autoRebalance);

router.route('/seed')
  .post(seedAllocationData);

module.exports = router;
