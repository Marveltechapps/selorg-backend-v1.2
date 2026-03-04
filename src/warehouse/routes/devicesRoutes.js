/**
 * Picker Workforce Device routes – /warehouse/devices
 * RBAC: warehouse/admin/super_admin
 */
const express = require('express');
const router = express.Router();
const devicesController = require('../controllers/devicesController');

router.get('/', devicesController.list);
router.post('/', devicesController.create);
router.patch('/:id', devicesController.patch);

module.exports = router;
