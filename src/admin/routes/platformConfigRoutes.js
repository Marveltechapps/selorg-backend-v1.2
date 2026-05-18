const express = require('express');
const { requirePermission } = require('../../core/middleware');
const { PERMISSIONS } = require('../../config/permissions');
const platformConfigController = require('../controllers/platformConfigController');

const router = express.Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.ADMIN_CONFIG_READ),
  platformConfigController.list
);
router.get(
  '/:key',
  requirePermission(PERMISSIONS.ADMIN_CONFIG_READ),
  platformConfigController.getOne
);
router.put(
  '/:key',
  requirePermission(PERMISSIONS.ADMIN_CONFIG_WRITE),
  platformConfigController.upsert
);
router.delete(
  '/:key',
  requirePermission(PERMISSIONS.ADMIN_CONFIG_WRITE),
  platformConfigController.remove
);

module.exports = router;
