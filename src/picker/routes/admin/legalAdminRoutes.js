const { Router } = require('express');
const { authenticateToken, requireRole } = require('../../../core/middleware');
const ctrl = require('../../controllers/admin/legalAdminController');

const router = Router();
const adminAuth = [authenticateToken, requireRole('admin', 'super_admin')];

router.get('/documents', adminAuth, ctrl.listDocuments);
router.get('/documents/:id', adminAuth, ctrl.getDocument);
router.post('/documents', adminAuth, ctrl.createDocument);
router.put('/documents/:id', adminAuth, ctrl.updateDocument);
router.delete('/documents/:id', adminAuth, ctrl.deleteDocument);
router.post('/documents/:id/set-current', adminAuth, ctrl.setCurrentDocument);

router.get('/config', adminAuth, ctrl.getConfig);
router.put('/config', adminAuth, ctrl.updateConfig);

module.exports = router;
