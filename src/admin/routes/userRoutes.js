const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const masterDataController = require('../controllers/masterDataController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const { cacheMiddleware } = require('../../core/middleware');
const asyncHandler = require('../../middleware/asyncHandler');
const appConfig = require('../../config/app');

// All routes require authentication and user management permissions
router.use(authenticateToken);

// Managers list (for Master Data dropdowns) - must be before /:id
router.get(
  '/managers',
  requirePermission(PERMISSIONS.ADMIN_USERS_READ),
  cacheMiddleware(appConfig.cache.admin.users),
  asyncHandler(masterDataController.listManagers)
);
router.get('/me', asyncHandler(userController.getCurrentUserProfile));

// Get users — admin.users.read (legacy JWT: view_users)
router.get('/', requirePermission(PERMISSIONS.ADMIN_USERS_READ), cacheMiddleware(appConfig.cache.admin.users), asyncHandler(userController.getUsers));
router.get('/:id', requirePermission(PERMISSIONS.ADMIN_USERS_READ), cacheMiddleware(appConfig.cache.admin.users), asyncHandler(userController.getUserById));

// Bulk operations - must be before /:id
router.post('/bulk', requirePermission(PERMISSIONS.ADMIN_USERS_WRITE), asyncHandler(userController.bulkUserAction));

// Email verification flow for user creation
router.post('/verification/send-otp', requirePermission(PERMISSIONS.ADMIN_USERS_WRITE), asyncHandler(userController.sendCreateUserOtp));
router.post('/verification/verify-otp', requirePermission(PERMISSIONS.ADMIN_USERS_WRITE), asyncHandler(userController.verifyCreateUserOtp));

// Create/update/delete users - requires manage_users permission
router.post('/', requirePermission(PERMISSIONS.ADMIN_USERS_WRITE), asyncHandler(userController.createUser));
router.put('/:id/reset-password', requirePermission(PERMISSIONS.ADMIN_USERS_WRITE), asyncHandler(userController.resetPassword));
router.put('/:id', requirePermission(PERMISSIONS.ADMIN_USERS_WRITE), asyncHandler(userController.updateUser));
router.delete('/:id', requirePermission(PERMISSIONS.ADMIN_USERS_WRITE), asyncHandler(userController.deleteUser));

// Assign role - requires assign_roles permission
router.put('/:id/role', requirePermission(PERMISSIONS.ADMIN_ROLES_WRITE), asyncHandler(userController.assignRole));

module.exports = router;
