const { Router } = require('express');
const { authenticateToken, requireRole, requirePermission } = require('../../../core/middleware');
const { PERMISSIONS } = require('../../../config/permissions');
const ctrl = require('../../controllers/admin/notificationAdminController');

const router = Router();
const notifyRead = [
  authenticateToken,
  requireRole('admin', 'super_admin'),
  requirePermission(PERMISSIONS.ADMIN_CONFIG_READ),
];
const notifyWrite = [
  authenticateToken,
  requireRole('admin', 'super_admin'),
  requirePermission(PERMISSIONS.ADMIN_CONFIG_WRITE),
];

router.get('/', notifyRead, ctrl.list);
router.get('/stats', notifyRead, ctrl.stats);
router.post('/send', notifyWrite, ctrl.send);
router.delete('/:id', notifyWrite, ctrl.remove);

module.exports = router;
