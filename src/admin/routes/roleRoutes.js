const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const { cacheMiddleware } = require('../../core/middleware');
const asyncHandler = require('../../middleware/asyncHandler');
const appConfig = require('../../config/app');

router.use(authenticateToken);

router.get('/', requirePermission(PERMISSIONS.ADMIN_ROLES_READ), cacheMiddleware(appConfig.cache.admin.roles), asyncHandler(roleController.getRoles));
router.get('/templates', requirePermission(PERMISSIONS.ADMIN_ROLES_READ), cacheMiddleware(appConfig.cache.admin.roles), asyncHandler(roleController.getRoleTemplates));
router.get('/:id', requirePermission(PERMISSIONS.ADMIN_ROLES_READ), cacheMiddleware(appConfig.cache.admin.roles), asyncHandler(roleController.getRoleById));
router.get('/:id/export', requirePermission(PERMISSIONS.ADMIN_ROLES_READ), asyncHandler(roleController.exportRoleConfig));
router.post('/', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(roleController.createRole));
router.post('/from-template', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(roleController.createRoleFromTemplate));
router.post('/import', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(roleController.importRoleConfig));
router.put('/:id', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(roleController.updateRole));
router.put('/:id/matrix', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(roleController.updateRoleMatrix));
router.delete('/:id', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(roleController.deleteRole));

module.exports = router;
