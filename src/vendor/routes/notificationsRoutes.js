const express = require('express');
const router = express.Router();
const vendorDashboardNotificationController = require('../controllers/vendorDashboardNotificationController');

router.get('/', vendorDashboardNotificationController.list);
router.patch('/:id/read', vendorDashboardNotificationController.markRead);
router.post('/read-all', vendorDashboardNotificationController.markAllRead);

module.exports = router;
