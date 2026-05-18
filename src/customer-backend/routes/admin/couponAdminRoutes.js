const { Router } = require('express');
const { authenticateToken, requireRole, requirePermission } = require('../../../core/middleware');
const { PERMISSIONS } = require('../../../config/permissions');
const ctrl = require('../../controllers/admin/couponAdminController');

const router = Router();
const pricingRead = [
  authenticateToken,
  requireRole('admin', 'super_admin'),
  requirePermission(PERMISSIONS.PRICING_READ),
];
const pricingWrite = [
  authenticateToken,
  requireRole('admin', 'super_admin'),
  requirePermission(PERMISSIONS.PRICING_OVERRIDE),
];

router.get('/', pricingRead, ctrl.list);
router.get('/stats', pricingRead, ctrl.stats);
router.get('/:id', pricingRead, ctrl.getById);
router.post('/', pricingWrite, ctrl.create);
router.put('/:id', pricingWrite, ctrl.update);
router.delete('/:id', pricingWrite, ctrl.remove);

module.exports = router;
