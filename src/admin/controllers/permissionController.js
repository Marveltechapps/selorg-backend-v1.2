const Permission = require('../models/Permission');
const logger = require('../../core/utils/logger');
const cacheInvalidation = require('../cacheInvalidation');

/**
 * Get all permissions
 */
const getPermissions = async (req, res, next) => {
  try {
    const { module, category, isActive } = req.query;
    
    const filter = {};
    if (module) filter.module = module;
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const permissions = await Permission.find(filter)
      .sort({ module: 1, displayName: 1 })
      .lean();

    const permissionsWithId = permissions.map(perm => ({
      ...perm,
      id: perm._id.toString(),
    }));

    res.json({
      success: true,
      data: permissionsWithId,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching permissions', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Get permission by ID
 */
const getPermissionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const permission = await Permission.findById(id).lean();

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PERMISSION_NOT_FOUND',
          message: 'Permission not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    res.json({
      success: true,
      data: {
        ...permission,
        id: permission._id.toString(),
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching permission', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Create new permission
 */
const createPermission = async (req, res, next) => {
  try {
    const { name, displayName, module, description, category } = req.body;

    // Validate required fields
    if (!name || !displayName || !module) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name, displayName, and module are required',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if permission name already exists
    const existingPermission = await Permission.findOne({ name: name.toLowerCase() });
    if (existingPermission) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PERMISSION_EXISTS',
          message: 'Permission with this name already exists',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const permissionData = {
      name: name.toLowerCase(),
      displayName,
      module,
      description: description || '',
      category: category || 'read',
    };

    const permission = await Permission.create(permissionData);
    const permObj = permission.toObject();
    permObj.id = permObj._id.toString();
    delete permObj._id;
    delete permObj.__v;

    logger.info('Permission created', {
      permissionId: permission._id.toString(),
      permissionName: name,
      requestId: req.id,
    });

    await cacheInvalidation.invalidatePermissions().catch(() => {});

    res.status(201).json({
      success: true,
      data: permObj,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error creating permission', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Update permission
 */
const updatePermission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { displayName, module, description, category, isActive } = req.body;

    const permission = await Permission.findById(id);
    if (!permission) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PERMISSION_NOT_FOUND',
          message: 'Permission not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Update fields (name cannot be changed)
    if (displayName) permission.displayName = displayName;
    if (module) permission.module = module;
    if (description !== undefined) permission.description = description;
    if (category) permission.category = category;
    if (isActive !== undefined) permission.isActive = isActive;

    await permission.save();

    const permObj = permission.toObject();
    permObj.id = permObj._id.toString();
    delete permObj._id;
    delete permObj.__v;

    logger.info('Permission updated', {
      permissionId: id,
      requestId: req.id,
    });

    await cacheInvalidation.invalidatePermissions().catch(() => {});

    res.json({
      success: true,
      data: permObj,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error updating permission', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Delete permission
 */
const deletePermission = async (req, res, next) => {
  try {
    const { id } = req.params;

    const permission = await Permission.findById(id);
    if (!permission) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PERMISSION_NOT_FOUND',
          message: 'Permission not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    await Permission.findByIdAndDelete(id);

    logger.info('Permission deleted', {
      permissionId: id,
      permissionName: permission.name,
      requestId: req.id,
    });

    await cacheInvalidation.invalidatePermissions().catch(() => {});

    res.json({
      success: true,
      message: 'Permission deleted successfully',
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error deleting permission', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

module.exports = {
  getPermissions,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission,
};
