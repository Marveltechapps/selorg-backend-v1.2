const { Router } = require('express');
const { authenticateToken, requireRole } = require('../../../core/middleware');
const ctrl = require('../../controllers/admin/notificationAdminController');

const router = Router();
const adminAuth = [authenticateToken, requireRole('admin', 'super_admin')];

router.get('/', adminAuth, ctrl.list);
router.get('/stats', adminAuth, ctrl.stats);
router.post('/send', adminAuth, ctrl.send);
router.delete('/:id', adminAuth, ctrl.remove);

module.exports = router;
