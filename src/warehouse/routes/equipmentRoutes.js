const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipmentController');

// Devices
router.get('/devices', equipmentController.getDevices);
router.get('/devices/:id', equipmentController.getDeviceDetails);

// Machinery
router.get('/machinery', equipmentController.getMachinery);
router.post('/machinery', equipmentController.addEquipment);
router.get('/machinery/:id', equipmentController.getEquipmentDetails);
router.post('/machinery/:id/issue', equipmentController.reportIssue);
router.post('/machinery/:id/resolve', equipmentController.resolveIssue);

// Export
router.get('/export', equipmentController.exportEquipment);

module.exports = router;

