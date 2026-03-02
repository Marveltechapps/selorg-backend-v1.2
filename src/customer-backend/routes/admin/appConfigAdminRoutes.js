const { Router } = require('express');
const { authenticateToken, requireRole } = require('../../../core/middleware');
const ctrl = require('../../controllers/admin/appConfigAdminController');

const router = Router();
const adminAuth = [authenticateToken, requireRole('admin', 'super_admin')];

router.get('/', adminAuth, ctrl.getConfig);
router.put('/', adminAuth, ctrl.updateConfig);
router.put('/section/:section', adminAuth, ctrl.updateSection);
router.post('/reset', adminAuth, ctrl.resetConfig);

module.exports = router;
