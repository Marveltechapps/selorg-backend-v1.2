const express = require('express');
const router = express.Router();
const riderDashboardNotificationController = require('../controllers/riderDashboardNotificationController');

router.get('/', riderDashboardNotificationController.list);
router.patch('/:id/read', riderDashboardNotificationController.markRead);
router.post('/read-all', riderDashboardNotificationController.markAllRead);

module.exports = router;
