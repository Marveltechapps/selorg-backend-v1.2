const express = require('express');
const {
  getAnalyticsSummary,
  createAnalyticsRecord,
  seedAnalyticsData
} = require('../controllers/analyticsController');

const router = express.Router();

router.route('/summary')
  .get(getAnalyticsSummary);

router.route('/records')
  .post(createAnalyticsRecord);

router.route('/seed')
  .post(seedAnalyticsData);

module.exports = router;
