const { Router } = require('express');
const { authenticateToken, requireRole } = require('../../../core/middleware');
const ctrl = require('../../controllers/admin/couponAdminController');

const router = Router();
const adminAuth = [authenticateToken, requireRole('admin', 'super_admin')];

router.get('/', adminAuth, ctrl.list);
router.get('/stats', adminAuth, ctrl.stats);
router.get('/:id', adminAuth, ctrl.getById);
router.post('/', adminAuth, ctrl.create);
router.put('/:id', adminAuth, ctrl.update);
router.delete('/:id', adminAuth, ctrl.remove);

module.exports = router;
