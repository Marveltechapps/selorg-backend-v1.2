// Use the vendor User model (same as seed script) to ensure we can find seeded users
const User = require('../../vendor/models/User');
const Role = require('../models/Role');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

async function registerUser(payload) {
  const { email, password, name, role } = payload;
  const normalizedEmail = email ? email.toLowerCase().trim() : email;
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw new Error('User already exists');
  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ email: normalizedEmail, password: hashed, name, role });
  const obj = user.toObject();
  delete obj.password;
  return obj;
}

async function authenticateUser(email, password, role) {
  // Normalize email to lowercase for case-insensitive lookup
  const normalizedEmail = email ? email.toLowerCase().trim() : email;
  
  console.log('Authenticating user:', { email: normalizedEmail, role });
  
  // Populate role and permissions for admin users
  const user = await User.findOne({ email: normalizedEmail });
  
  if (!user) {
    console.log('User not found:', normalizedEmail);
    return null;
  }
  
  console.log('User found:', { email: user.email, role: user.role, hasPassword: !!user.password });
  
  // If role is specified, verify it matches (case-insensitive).
  // super_admin can log in as "admin" (or any dashboard) since they have access to all.
  const userRoleLower = user.role && user.role.toLowerCase().trim();
  const requestedRoleLower = role && role.toLowerCase().trim();
  if (role && user.role) {
    const roleMatches =
      userRoleLower === requestedRoleLower ||
      (userRoleLower === 'super_admin' && requestedRoleLower === 'admin');
    if (!roleMatches) {
      console.log('Role mismatch:', { userRole: user.role, requestedRole: role });
      return null;
    }
  }
  
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    console.log('Password mismatch for user:', normalizedEmail);
    return null;
  }
  
  console.log('Authentication successful for:', normalizedEmail);
  
  // Get permissions from user or role
  let permissions = user.permissions || [];
  
  // If user has roleId, fetch the role document to get permissions
  if (user.roleId) {
    try {
      const roleDoc = await Role.findById(user.roleId);
      if (roleDoc && roleDoc.permissions && roleDoc.permissions.length > 0) {
        permissions = roleDoc.permissions;
      }
    } catch (err) {
      console.warn('Failed to fetch role permissions:', err);
    }
  }
  
  // For super admin or admin role, grant all permissions
  const adminRoles = ['admin', 'super_admin', 'Admin', 'Super Admin', 'superadmin'];
  if (adminRoles.includes(user.role)) {
    permissions = ['*']; // Wildcard for all permissions
  }
  
  // If still no permissions, grant basic permissions for admin users
  if (permissions.length === 0 && (user.role === 'admin' || user.role === 'Admin')) {
    permissions = ['*']; // Grant all permissions to admin users
  }
  
  // Update last login (if schema supports it - vendor User model might not have this field)
  try {
    if (user.schema && user.schema.paths.lastLogin) {
      user.lastLogin = new Date();
      await user.save();
    }
  } catch (err) {
    // Ignore if lastLogin field doesn't exist
    console.warn('Could not update lastLogin:', err.message);
  }
  
  const roleNormalized = (user.role && typeof user.role === 'string') ? user.role.toLowerCase().trim() : (user.role || '');
  const assignedStores = user.assignedStores || [];
  const primaryStoreId = user.primaryStoreId || (assignedStores.length > 0 ? assignedStores[0] : '');
  const token = jwt.sign(
    { 
      id: user._id.toString(),
      userId: user._id.toString(),
      email: user.email, 
      role: roleNormalized,
      name: user.name || '',
      roleId: user.roleId?._id?.toString() || user.roleId?.toString() || null,
      permissions: permissions,
      assignedStores,
      primaryStoreId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  
  const obj = user.toObject();
  delete obj.password;
  return { token, user: obj };
}

module.exports = { registerUser, authenticateUser };
