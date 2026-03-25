const Role = require('../models/Role');
const User = require('../models/User');
const Permission = require('../models/Permission');
const logger = require('../../core/utils/logger');
const cacheInvalidation = require('../cacheInvalidation');
const { logAdminAction } = require('../services/adminAudit.service');

const ROLE_IMPORT_SCHEMA_VERSION = '1.0.0';

const normalizePermissionNames = (permissionValues = []) => (
  Array.from(new Set(
    permissionValues
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean)
  ))
);

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

/**
 * Get built-in and custom role templates
 */
const getRoleTemplates = async (req, res, next) => {
  try {
    const templates = await Role.find({ isTemplate: true, isActive: true })
      .sort({ isSystemTemplate: -1, name: 1 })
      .lean();

    res.json({
      success: true,
      data: templates.map((role) => ({
        ...role,
        id: role._id.toString(),
      })),
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching role templates', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Create role from role template
 */
const createRoleFromTemplate = async (req, res, next) => {
  try {
    const { name, templateId, templateKey, description, accessScope } = req.body;
    if (!name || (!templateId && !templateKey)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name and templateId/templateKey are required',
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const existingRole = await Role.findOne({ name: name.trim() });
    if (existingRole) {
      return res.status(409).json({
        success: false,
        error: { code: 'ROLE_EXISTS', message: 'Role with this name already exists' },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const templateFilter = templateId
      ? { _id: templateId, isTemplate: true, isActive: true }
      : { templateKey: String(templateKey).trim().toLowerCase(), isTemplate: true, isActive: true };

    const templateRole = await Role.findOne(templateFilter).lean();
    if (!templateRole) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Role template not found' },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const role = await Role.create({
      name: name.trim(),
      description: description ?? templateRole.description ?? '',
      roleType: 'custom',
      permissions: templateRole.permissions || [],
      accessScope: accessScope || templateRole.accessScope || 'global',
      riskLevel: templateRole.riskLevel || 'medium',
      createdBy: req.user?.userId,
    });

    await logAdminAction({
      action: 'role_created_from_template',
      entityType: 'role',
      entityId: role._id.toString(),
      userId: req.user?.userId,
      details: {
        roleName: role.name,
        templateRoleId: templateRole._id?.toString?.(),
        templateKey: templateRole.templateKey || null,
      },
      req,
    });

    await cacheInvalidation.invalidateRoles().catch(() => {});

    const roleObj = role.toObject();
    roleObj.id = roleObj._id.toString();
    delete roleObj._id;
    delete roleObj.__v;

    res.status(201).json({
      success: true,
      data: { ...roleObj, userCount: 0 },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Error creating role from template', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

/**
 * Update a role via matrix selections
 */
const updateRoleMatrix = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permissions = [], accessScope, riskLevel } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'permissions must be an array' },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        error: { code: 'ROLE_NOT_FOUND', message: 'Role not found' },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const normalizedPermissions = normalizePermissionNames(permissions);
    if (normalizedPermissions.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'At least one permission is required' },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const knownPermissions = await Permission.find({
      name: { $in: normalizedPermissions },
      isActive: true,
    }).select('name').lean();
    const knownSet = new Set(knownPermissions.map((p) => p.name));
    const unknownPermissions = normalizedPermissions.filter((perm) => !knownSet.has(perm));
    if (unknownPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNKNOWN_PERMISSIONS',
          message: `Unknown permission(s): ${unknownPermissions.join(', ')}`,
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    role.permissions = normalizedPermissions;
    if (accessScope) role.accessScope = accessScope;
    if (riskLevel) role.riskLevel = riskLevel;
    await role.save();

    await logAdminAction({
      action: 'role_matrix_updated',
      entityType: 'role',
      entityId: role._id.toString(),
      userId: req.user?.userId,
      details: {
        roleName: role.name,
        permissionsCount: normalizedPermissions.length,
        accessScope: role.accessScope,
        riskLevel: role.riskLevel,
      },
      req,
    });

    await cacheInvalidation.invalidateRoles().catch(() => {});

    const roleObj = role.toObject();
    roleObj.id = roleObj._id.toString();
    delete roleObj._id;
    delete roleObj.__v;

    const userCount = await User.countDocuments({ roleId: role._id, status: 'active' });
    res.json({
      success: true,
      data: { ...roleObj, userCount },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Error updating role matrix', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

const exportRoleConfig = async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id).lean();
    if (!role) {
      return res.status(404).json({
        success: false,
        error: { code: 'ROLE_NOT_FOUND', message: 'Role not found' },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const payload = {
      schemaVersion: ROLE_IMPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      role: {
        name: role.name,
        description: role.description || '',
        accessScope: role.accessScope || 'global',
        riskLevel: role.riskLevel || 'medium',
        permissions: role.permissions || [],
      },
    };

    await logAdminAction({
      action: 'role_config_exported',
      entityType: 'role',
      entityId: role._id.toString(),
      userId: req.user?.userId,
      details: { roleName: role.name, schemaVersion: ROLE_IMPORT_SCHEMA_VERSION },
      req,
    });

    res.json({
      success: true,
      data: payload,
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Error exporting role config', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    next(error);
  }
};

const importRoleConfig = async (req, res, next) => {
  try {
    const { role: incomingRole, overwrite = false } = req.body || {};
    if (!incomingRole || typeof incomingRole !== 'object') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'role payload is required' },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const roleName = String(incomingRole.name || '').trim();
    const normalizedPermissions = normalizePermissionNames(incomingRole.permissions || []);
    if (!roleName || normalizedPermissions.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'role.name and at least one permission are required',
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    const knownPermissions = await Permission.find({
      name: { $in: normalizedPermissions },
      isActive: true,
    }).select('name').lean();
    const knownSet = new Set(knownPermissions.map((p) => p.name));
    const unknownPermissions = normalizedPermissions.filter((perm) => !knownSet.has(perm));
    if (unknownPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNKNOWN_PERMISSIONS',
          message: `Unknown permission(s): ${unknownPermissions.join(', ')}`,
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    let role = await Role.findOne({ name: roleName });
    if (role && !overwrite) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ROLE_EXISTS',
          message: 'Role exists already. Set overwrite=true to replace it.',
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }

    if (!role) {
      role = await Role.create({
        name: roleName,
        description: String(incomingRole.description || ''),
        roleType: 'custom',
        permissions: normalizedPermissions,
        accessScope: incomingRole.accessScope || 'global',
        riskLevel: incomingRole.riskLevel || 'medium',
        createdBy: req.user?.userId,
      });
    } else {
      role.description = String(incomingRole.description || role.description || '');
      role.permissions = normalizedPermissions;
      if (incomingRole.accessScope) role.accessScope = incomingRole.accessScope;
      if (incomingRole.riskLevel) role.riskLevel = incomingRole.riskLevel;
      await role.save();
    }

    await logAdminAction({
      action: 'role_config_imported',
      entityType: 'role',
      entityId: role._id.toString(),
      userId: req.user?.userId,
      details: {
        roleName: role.name,
        overwrite: Boolean(overwrite),
        permissionsCount: normalizedPermissions.length,
      },
      req,
    });

    await cacheInvalidation.invalidateRoles().catch(() => {});

    const roleObj = role.toObject();
    roleObj.id = roleObj._id.toString();
    delete roleObj._id;
    delete roleObj.__v;

    const userCount = await User.countDocuments({ roleId: role._id, status: 'active' });
    res.status(201).json({
      success: true,
      data: { ...roleObj, userCount },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Error importing role config', {
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
  getRoleTemplates,
  createRoleFromTemplate,
  updateRoleMatrix,
  exportRoleConfig,
  importRoleConfig,
};
