const express = require('express');
const router = express.Router();
const warehouseNotificationController = require('../controllers/warehouseNotificationController');

router.get('/', warehouseNotificationController.list);
router.patch('/:id/read', warehouseNotificationController.markRead);
router.post('/read-all', warehouseNotificationController.markAllRead);

module.exports = router;
