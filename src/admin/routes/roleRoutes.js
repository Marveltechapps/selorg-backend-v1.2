const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const { cacheMiddleware } = require('../../core/middleware');
const asyncHandler = require('../../middleware/asyncHandler');
const appConfig = require('../../config/app');

// All routes require authentication and manage_roles permission
router.use(authenticateToken);
router.use(requirePermission('manage_roles'));

router.get('/', cacheMiddleware(appConfig.cache.admin.roles), asyncHandler(roleController.getRoles));
router.get('/templates', cacheMiddleware(appConfig.cache.admin.roles), asyncHandler(roleController.getRoleTemplates));
router.get('/:id', cacheMiddleware(appConfig.cache.admin.roles), asyncHandler(roleController.getRoleById));
router.get('/:id/export', asyncHandler(roleController.exportRoleConfig));
router.post('/', asyncHandler(roleController.createRole));
router.post('/from-template', asyncHandler(roleController.createRoleFromTemplate));
router.post('/import', asyncHandler(roleController.importRoleConfig));
router.put('/:id', asyncHandler(roleController.updateRole));
router.put('/:id/matrix', asyncHandler(roleController.updateRoleMatrix));
router.delete('/:id', asyncHandler(roleController.deleteRole));

module.exports = router;
