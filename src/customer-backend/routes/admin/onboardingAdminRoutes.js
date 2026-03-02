const { Router } = require('express');
const { authenticateToken, requireRole } = require('../../../core/middleware');
const ctrl = require('../../controllers/admin/onboardingAdminController');

const router = Router();
const adminAuth = [authenticateToken, requireRole('admin', 'super_admin')];

router.get('/', adminAuth, ctrl.list);
router.post('/', adminAuth, ctrl.create);
router.put('/reorder', adminAuth, ctrl.reorder);
router.put('/:id', adminAuth, ctrl.update);
router.delete('/:id', adminAuth, ctrl.remove);
router.post('/:id/image', adminAuth, ctrl.uploadImage);

module.exports = router;
