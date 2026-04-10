const { Router } = require('express');
const { authenticateToken, requireRole } = require('../../../core/middleware');
const cmsAdminController = require('../../controllers/admin/cmsAdminController');
const { uploadExcel } = require('../../middleware/uploadExcel');

const router = Router();
const adminAuth = [authenticateToken, requireRole('admin', 'super_admin')];

router.get('/overview', adminAuth, cmsAdminController.getOverview);

// Excel uploads (2 independent mastersheets)
router.post('/upload/sku-master', adminAuth, uploadExcel({ maxFileSizeMB: 20 }), cmsAdminController.uploadSkuMaster);
router.post('/upload/cms-pages', adminAuth, uploadExcel({ maxFileSizeMB: 10 }), cmsAdminController.uploadCmsPages);
router.post(
  '/upload/content-hub-master',
  adminAuth,
  uploadExcel({ maxFileSizeMB: 20 }),
  cmsAdminController.uploadContentHubMaster
);
router.get('/import-history/content-hub', adminAuth, cmsAdminController.listContentHubImportRuns);

router.get('/pages', adminAuth, cmsAdminController.listPages);
router.get('/pages/:id', adminAuth, cmsAdminController.getPage);
router.post('/pages', adminAuth, cmsAdminController.createPage);
router.put('/pages/:id', adminAuth, cmsAdminController.updatePage);
router.delete('/pages/:id', adminAuth, cmsAdminController.deletePage);

router.get('/collections', adminAuth, cmsAdminController.listCollections);
router.post('/collections', adminAuth, cmsAdminController.createCollection);
router.put('/collections/:id', adminAuth, cmsAdminController.updateCollection);
router.delete('/collections/:id', adminAuth, cmsAdminController.deleteCollection);

router.get('/media', adminAuth, cmsAdminController.listMedia);
router.post('/media', adminAuth, cmsAdminController.createMedia);
router.delete('/media/:id', adminAuth, cmsAdminController.deleteMedia);

module.exports = router;
