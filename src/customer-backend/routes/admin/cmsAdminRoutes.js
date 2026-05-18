const { Router } = require('express');
const { authenticateToken, requireRole, requirePermission } = require('../../../core/middleware');
const { PERMISSIONS } = require('../../../config/permissions');
const cmsAdminController = require('../../controllers/admin/cmsAdminController');
const { uploadExcel } = require('../../middleware/uploadExcel');

const router = Router();
const catalogRead = [
  authenticateToken,
  requireRole('admin', 'super_admin'),
  requirePermission(PERMISSIONS.CATALOG_PRODUCTS_READ),
];
const catalogWrite = [
  authenticateToken,
  requireRole('admin', 'super_admin'),
  requirePermission(PERMISSIONS.CATALOG_PRODUCTS_WRITE),
];

router.get('/overview', catalogRead, cmsAdminController.getOverview);

// Excel uploads (2 independent mastersheets)
router.post('/upload/sku-master', catalogWrite, uploadExcel({ maxFileSizeMB: 20 }), cmsAdminController.uploadSkuMaster);
router.post('/upload/cms-pages', catalogWrite, uploadExcel({ maxFileSizeMB: 10 }), cmsAdminController.uploadCmsPages);
router.post(
  '/upload/content-hub-master',
  catalogWrite,
  uploadExcel({ maxFileSizeMB: 20 }),
  cmsAdminController.uploadContentHubMaster
);
router.get('/import-history/content-hub', catalogRead, cmsAdminController.listContentHubImportRuns);

router.get('/pages', catalogRead, cmsAdminController.listPages);
router.get('/pages/:id', catalogRead, cmsAdminController.getPage);
router.post('/pages', catalogWrite, cmsAdminController.createPage);
router.put('/pages/:id', catalogWrite, cmsAdminController.updatePage);
router.delete('/pages/:id', catalogWrite, cmsAdminController.deletePage);

router.get('/collections', catalogRead, cmsAdminController.listCollections);
router.post('/collections', catalogWrite, cmsAdminController.createCollection);
router.put('/collections/:id', catalogWrite, cmsAdminController.updateCollection);
router.delete('/collections/:id', catalogWrite, cmsAdminController.deleteCollection);

router.get('/media', catalogRead, cmsAdminController.listMedia);
router.post('/media', catalogWrite, cmsAdminController.createMedia);
router.delete('/media/:id', catalogWrite, cmsAdminController.deleteMedia);

// Banners
router.get('/banners', catalogRead, cmsAdminController.listBanners);
router.post('/banners', catalogWrite, cmsAdminController.createBanner);
router.put('/banners/:id', catalogWrite, cmsAdminController.updateBanner);
router.delete('/banners/:id', catalogWrite, cmsAdminController.deleteBanner);

// Home Sections
router.get('/home-sections', catalogRead, cmsAdminController.listHomeSections);
router.post('/home-sections', catalogWrite, cmsAdminController.createHomeSection);
router.put('/home-sections/:id', catalogWrite, cmsAdminController.updateHomeSection);
router.delete('/home-sections/:id', catalogWrite, cmsAdminController.deleteHomeSection);

// Buttons
router.get('/buttons', catalogRead, cmsAdminController.listButtons);
router.post('/buttons', catalogWrite, cmsAdminController.createButton);
router.put('/buttons/:id', catalogWrite, cmsAdminController.updateButton);
router.delete('/buttons/:id', catalogWrite, cmsAdminController.deleteButton);

module.exports = router;
