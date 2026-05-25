const express = require('express');
const {
  getAnalyticsSummary,
  getCampaignAnalytics,
  exportAnalytics,
  saveAnalyticsPreset,
  createAnalyticsRecord,
  seedAnalyticsData,
} = require('../controllers/analyticsController');

const router = express.Router();

router.route('/summary')
  .get(getAnalyticsSummary);

router.route('/export')
  .post(exportAnalytics);

router.route('/presets')
  .post(saveAnalyticsPreset);

router.route('/campaign/:entityId')
  .get(getCampaignAnalytics);

router.route('/records')
  .post(createAnalyticsRecord);

router.route('/seed')
  .post(seedAnalyticsData);

module.exports = router;
