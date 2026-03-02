const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const { cacheMiddleware } = require('../../core/middleware');
const asyncHandler = require('../../middleware/asyncHandler');
const appConfig = require('../../config/app');

// All routes require authentication and manage_roles permission
router.use(authenticateToken);
router.use(requirePermission('manage_roles'));

router.get('/', cacheMiddleware(appConfig.cache.admin.permissions), asyncHandler(permissionController.getPermissions));
router.get('/:id', cacheMiddleware(appConfig.cache.admin.permissions), asyncHandler(permissionController.getPermissionById));
router.post('/', asyncHandler(permissionController.createPermission));
router.put('/:id', asyncHandler(permissionController.updatePermission));
router.delete('/:id', asyncHandler(permissionController.deletePermission));

module.exports = router;
