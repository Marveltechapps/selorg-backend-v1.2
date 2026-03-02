const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const AuditLog = require('../../common-models/AuditLog');
const bcrypt = require('bcryptjs');
const logger = require('../../core/utils/logger');
const cacheInvalidation = require('../cacheInvalidation');

async function auditAdminAction(req, moduleName, action, entityType, entityId, details = {}) {
  try {
    await AuditLog.create({
      module: moduleName,
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      userId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
      severity: action.startsWith('user_delete') ? 'critical' : 'info',
      details,
      ipAddress: req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim(),
      userAgent: req.get?.('user-agent'),
    });
  } catch (err) {
    logger.warn('AuditLog create failed', { err: err.message, action });
  }
}

/**
 * Get all users
 */
const getUsers = async (req, res, next) => {
  try {
    const { status, roleId, department, search } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (roleId) filter.roleId = roleId;
    if (department) filter.department = department;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .populate('roleId', 'name description accessScope')
      .populate('reportingManagerId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const deriveAvatar = (name) =>
      (name || 'U').split(' ').map(n => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'U';

    const usersWithRole = users.map(user => {
      const role = user.roleId;
      return {
        ...user,
        id: user._id.toString(),
        roleName: role?.name,
        accessLevel: role?.accessScope === 'global' ? 'Full Access' : 
                     role?.accessScope === 'zone' ? 'Zone Limited' : 'Store Limited',
        avatar: deriveAvatar(user.name),
      };
    });

    res.json({
      success: true,
      data: usersWithRole,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching users', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Get user by ID
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate('roleId', 'name description permissions accessScope')
      .populate('reportingManagerId', 'name email')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const role = user.roleId;
    const deriveAvatar = (name) =>
      (name || 'U').split(' ').map(n => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'U';

    res.json({
      success: true,
      data: {
        ...user,
        id: user._id.toString(),
        roleName: role?.name,
        accessLevel: role?.accessScope === 'global' ? 'Full Access' : 
                     role?.accessScope === 'zone' ? 'Zone Limited' : 'Store Limited',
        avatar: deriveAvatar(user.name),
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching user', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Create new user
 */
const createUser = async (req, res, next) => {
  try {
    const {
      email,
      password,
      name,
      department,
      roleId,
      reportingManagerId,
      location,
      twoFactorEnabled,
      startDate,
      notes,
      assignedStores,
      primaryStoreId,
    } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email, password, and name are required',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email already exists',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate role if provided
    let role = null;
    if (roleId) {
      role = await Role.findById(roleId);
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
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      department: department || '',
      roleId: roleId || null,
      role: role?.name || null,
      permissions: role?.permissions || [],
      reportingManagerId: reportingManagerId || null,
      location: location || [],
      twoFactorEnabled: twoFactorEnabled || false,
      startDate: startDate ? new Date(startDate) : new Date(),
      notes: notes || '',
      assignedStores: assignedStores || [],
      primaryStoreId: primaryStoreId || '',
      status: 'active',
    };

    const user = await User.create(userData);
    const userObj = user.toObject();
    userObj.id = userObj._id.toString();
    delete userObj._id;
    delete userObj.__v;
    delete userObj.password;

    logger.info('User created', {
      userId: user._id.toString(),
      email: user.email,
      createdBy: req.user?.userId,
      requestId: req.id,
    });
    await auditAdminAction(req, 'admin', 'user_create', 'User', user._id.toString(), { email: user.email });

    await cacheInvalidation.invalidateUsers().catch(() => {});

    const deriveAvatar = (name) =>
      (name || 'U').split(' ').map(n => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'U';

    res.status(201).json({
      success: true,
      data: {
        ...userObj,
        roleName: role?.name,
        accessLevel: role?.accessScope === 'global' ? 'Full Access' : 
                     role?.accessScope === 'zone' ? 'Zone Limited' : 'Store Limited',
        avatar: deriveAvatar(user.name),
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error creating user', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Update user
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      department,
      roleId,
      status,
      reportingManagerId,
      location,
      notes,
      assignedStores,
      primaryStoreId,
    } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate role if provided
    let role = null;
    if (roleId && roleId !== user.roleId?.toString()) {
      role = await Role.findById(roleId);
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
    }

    // Update fields
    if (name) user.name = name;
    if (department !== undefined) user.department = department;
    if (roleId) {
      user.roleId = roleId;
      user.role = role?.name || null;
      user.permissions = role?.permissions || [];
    }
    if (status) user.status = status;
    if (reportingManagerId !== undefined) user.reportingManagerId = reportingManagerId;
    if (location !== undefined) user.location = location;
    if (notes !== undefined) user.notes = notes;
    if (assignedStores !== undefined) user.assignedStores = assignedStores;
    if (primaryStoreId !== undefined) user.primaryStoreId = primaryStoreId;

    await user.save();

    const userObj = user.toObject();
    userObj.id = userObj._id.toString();
    delete userObj._id;
    delete userObj.__v;
    delete userObj.password;

    const updatedRole = await Role.findById(user.roleId);

    logger.info('User updated', {
      userId: id,
      updatedBy: req.user?.userId,
      requestId: req.id,
    });
    await auditAdminAction(req, 'admin', 'user_update', 'User', id, { email: user.email });

    await cacheInvalidation.invalidateUsers().catch(() => {});

    const deriveAvatar = (name) =>
      (name || 'U').split(' ').map(n => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'U';

    res.json({
      success: true,
      data: {
        ...userObj,
        roleName: updatedRole?.name,
        accessLevel: updatedRole?.accessScope === 'global' ? 'Full Access' : 
                     updatedRole?.accessScope === 'zone' ? 'Zone Limited' : 'Store Limited',
        avatar: deriveAvatar(user.name),
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error updating user', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Delete user
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    await User.findByIdAndDelete(id);

    logger.info('User deleted', {
      userId: id,
      email: user.email,
      deletedBy: req.user?.userId,
      requestId: req.id,
    });
    await auditAdminAction(req, 'admin', 'user_delete', 'User', id, { email: user.email });

    await cacheInvalidation.invalidateUsers().catch(() => {});

    res.json({
      success: true,
      message: 'User deleted successfully',
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error deleting user', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Assign role to user
 */
const assignRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'roleId is required',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const role = await Role.findById(roleId);
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

    user.roleId = roleId;
    user.role = role.name;
    user.permissions = role.permissions;
    await user.save();

    const userObj = user.toObject();
    userObj.id = userObj._id.toString();
    delete userObj._id;
    delete userObj.__v;
    delete userObj.password;

    logger.info('Role assigned to user', {
      userId: id,
      roleId,
      assignedBy: req.user?.userId,
      requestId: req.id,
    });
    await auditAdminAction(req, 'admin', 'role_assign', 'User', id, { roleId: String(roleId), roleName: role.name });

    await cacheInvalidation.invalidateUsers().catch(() => {});

    const deriveAvatar = (name) =>
      (name || 'U').split(' ').map(n => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'U';

    res.json({
      success: true,
      data: {
        ...userObj,
        roleName: role.name,
        accessLevel: role.accessScope === 'global' ? 'Full Access' : 
                     role.accessScope === 'zone' ? 'Zone Limited' : 'Store Limited',
        avatar: deriveAvatar(user.name),
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error assigning role', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Bulk user operations
 */
const bulkUserAction = async (req, res, next) => {
  try {
    const { action, userIds, roleId, updates } = req.body;

    if (!action || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'action and userIds (non-empty array) are required',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const validActions = ['activate', 'deactivate', 'assign_role', 'update'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `action must be one of: ${validActions.join(', ')}`,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (action === 'assign_role' && !roleId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'roleId is required for assign_role action',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (action === 'update' && (!updates || typeof updates !== 'object')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'updates object is required for update action',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    let role = null;
    if (action === 'assign_role') {
      role = await Role.findById(roleId);
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
    }

    const results = { updated: 0, failed: 0, errors: [] };

    for (const id of userIds) {
      try {
        const user = await User.findById(id);
        if (!user) {
          results.failed++;
          results.errors.push({ userId: id, error: 'User not found' });
          continue;
        }

        if (action === 'activate') {
          user.status = 'active';
        } else if (action === 'deactivate') {
          user.status = 'inactive';
        } else if (action === 'assign_role') {
          user.roleId = roleId;
          user.role = role.name;
          user.permissions = role.permissions;
        } else if (action === 'update') {
          if (updates.status) user.status = updates.status;
          if (updates.department !== undefined) user.department = updates.department;
          if (updates.notes !== undefined) user.notes = updates.notes;
        }

        await user.save();
        results.updated++;

        const auditAction = action === 'assign_role' ? 'role_assign' : 'user_update';
        await auditAdminAction(req, 'admin', auditAction, 'User', id, {
          action,
          email: user.email,
          roleId: action === 'assign_role' ? roleId : undefined,
          updates: action === 'update' ? updates : undefined,
        });
      } catch (err) {
        results.failed++;
        results.errors.push({ userId: id, error: err.message });
      }
    }

    await cacheInvalidation.invalidateUsers().catch(() => {});

    res.json({
      success: true,
      data: results,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error in bulk user action', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  assignRole,
  bulkUserAction,
};
