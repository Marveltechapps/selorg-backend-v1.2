const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const { cacheMiddleware } = require('../../core/middleware');
const asyncHandler = require('../../middleware/asyncHandler');
const appConfig = require('../../config/app');

router.use(authenticateToken);

router.get('/', requirePermission(PERMISSIONS.ADMIN_ROLES_READ), cacheMiddleware(appConfig.cache.admin.permissions), asyncHandler(permissionController.getPermissions));
router.get('/matrix', requirePermission(PERMISSIONS.ADMIN_ROLES_READ), cacheMiddleware(appConfig.cache.admin.permissions), asyncHandler(permissionController.getPermissionsMatrix));
router.get('/:id', requirePermission(PERMISSIONS.ADMIN_ROLES_READ), cacheMiddleware(appConfig.cache.admin.permissions), asyncHandler(permissionController.getPermissionById));
router.post('/', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(permissionController.createPermission));
router.put('/:id', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(permissionController.updatePermission));
router.delete('/:id', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(permissionController.deletePermission));

module.exports = router;
