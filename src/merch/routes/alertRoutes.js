const express = require('express');
const {
  getAlerts,
  updateAlert,
  bulkUpdateAlerts,
  seedAlertData
} = require('../controllers/alertController');

const router = express.Router();

router.route('/')
  .get(getAlerts);

router.route('/bulk-update')
  .post(bulkUpdateAlerts);

router.route('/seed')
  .post(seedAlertData);

router.route('/:id')
  .put(updateAlert);

module.exports = router;
