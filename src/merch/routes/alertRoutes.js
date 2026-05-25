const express = require('express');
const {
  getAlerts,
  updateAlert,
  bulkUpdateAlerts,
  seedAlertData,
  resolvePricingConflict,
  allocateStock,
  pauseCampaign,
  clearResolvedAlerts,
} = require('../controllers/alertController');

const router = express.Router();

router.route('/')
  .get(getAlerts);

router.route('/bulk-update')
  .post(bulkUpdateAlerts);

router.route('/clear-resolved')
  .post(clearResolvedAlerts);

router.route('/seed')
  .post(seedAlertData);

router.route('/:id/resolve-pricing')
  .post(resolvePricingConflict);

router.route('/:id/allocate-stock')
  .post(allocateStock);

router.route('/:id/pause-campaign')
  .post(pauseCampaign);

router.route('/:id')
  .put(updateAlert);

module.exports = router;
