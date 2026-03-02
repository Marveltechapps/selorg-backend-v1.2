const Role = require('../models/Role');
const User = require('../models/User');
const logger = require('../../core/utils/logger');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const cacheInvalidation = require('../cacheInvalidation');

/**
 * Get all roles
 */
const getRoles = async (req, res, next) => {
  try {
    const { roleType, accessScope, isActive } = req.query;
    
    const filter = {};
    if (roleType) filter.roleType = roleType;
    if (accessScope) filter.accessScope = accessScope;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const roles = await Role.find(filter)
      .populate('createdBy', 'name email')
      .lean();

    // Get user count for each role
    const rolesWithCount = await Promise.all(
      roles.map(async (role) => {
        const userCount = await User.countDocuments({ roleId: role._id, status: 'active' });
        return {
          ...role,
          id: role._id.toString(),
          userCount,
        };
      })
    );

    res.json({
      success: true,
      data: rolesWithCount,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching roles', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Get role by ID
 */
const getRoleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id)
      .populate('createdBy', 'name email')
      .lean();

    if (!role) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROLE_NOT_FOUND',
          message: 'Role not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const userCount = await User.countDocuments({ roleId: id, status: 'active' });

    res.json({
      success: true,
      data: {
        ...role,
        id: role._id.toString(),
        userCount,
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching role', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Create new role
 */
const createRole = async (req, res, next) => {
  try {
    const { name, description, roleType, permissions, accessScope } = req.body;

    // Validate required fields
    if (!name || !permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name and at least one permission are required',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if role name already exists
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ROLE_EXISTS',
          message: 'Role with this name already exists',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const roleData = {
      name,
      description: description || '',
      roleType: roleType || 'custom',
      permissions,
      accessScope: accessScope || 'global',
      createdBy: req.user?.userId,
    };

    const role = await Role.create(roleData);
    const roleObj = role.toObject();
    roleObj.id = roleObj._id.toString();
    delete roleObj._id;
    delete roleObj.__v;

    logger.info('Role created', {
      roleId: role._id.toString(),
      roleName: name,
      createdBy: req.user?.userId,
      requestId: req.id,
    });

    await cacheInvalidation.invalidateRoles().catch(() => {});

    res.status(201).json({
      success: true,
      data: {
        ...roleObj,
        userCount: 0,
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error creating role', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Update role
 */
const updateRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, roleType, permissions, accessScope, isActive } = req.body;

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROLE_NOT_FOUND',
          message: 'Role not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Prevent modification of system roles
    if (role.roleType === 'system' && (roleType || name)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SYSTEM_ROLE_PROTECTED',
          message: 'System roles cannot be modified',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if new name conflicts with existing role
    if (name && name !== role.name) {
      const existingRole = await Role.findOne({ name });
      if (existingRole) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ROLE_EXISTS',
            message: 'Role with this name already exists',
          },
          meta: {
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Update fields
    if (name) role.name = name;
    if (description !== undefined) role.description = description;
    if (roleType && role.roleType !== 'system') role.roleType = roleType;
    if (permissions && Array.isArray(permissions)) role.permissions = permissions;
    if (accessScope) role.accessScope = accessScope;
    if (isActive !== undefined) role.isActive = isActive;

    await role.save();

    const roleObj = role.toObject();
    roleObj.id = roleObj._id.toString();
    delete roleObj._id;
    delete roleObj.__v;

    const userCount = await User.countDocuments({ roleId: id, status: 'active' });

    logger.info('Role updated', {
      roleId: id,
      updatedBy: req.user?.userId,
      requestId: req.id,
    });

    await cacheInvalidation.invalidateRoles().catch(() => {});

    res.json({
      success: true,
      data: {
        ...roleObj,
        userCount,
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error updating role', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Delete role
 */
const deleteRole = async (req, res, next) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROLE_NOT_FOUND',
          message: 'Role not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Prevent deletion of system roles
    if (role.roleType === 'system') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SYSTEM_ROLE_PROTECTED',
          message: 'System roles cannot be deleted',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if role has assigned users
    const userCount = await User.countDocuments({ roleId: id });
    if (userCount > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ROLE_IN_USE',
          message: `Cannot delete role. ${userCount} user(s) are assigned to this role`,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    await Role.findByIdAndDelete(id);

    logger.info('Role deleted', {
      roleId: id,
      roleName: role.name,
      deletedBy: req.user?.userId,
      requestId: req.id,
    });

    await cacheInvalidation.invalidateRoles().catch(() => {});

    res.json({
      success: true,
      message: 'Role deleted successfully',
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error deleting role', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
};
