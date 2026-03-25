/**
 * Seed default permissions for the admin dashboard.
 * Run: node src/seedPermissions.js
 * Permissions are required for creating roles and assigning them to users.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const Permission = require('./admin/models/Permission');
const Role = require('./admin/models/Role');
const logger = require('./core/utils/logger');

const DEFAULT_PERMISSIONS = [
  // User management
  { name: 'view_users', displayName: 'View Users', module: 'users', action: 'view', description: 'View user list and details', category: 'read', riskLevel: 'low', dependsOn: [] },
  { name: 'create_users', displayName: 'Create Users', module: 'users', action: 'create', description: 'Create new users', category: 'write', riskLevel: 'medium', dependsOn: ['view_users'] },
  { name: 'edit_users', displayName: 'Edit Users', module: 'users', action: 'edit', description: 'Edit existing users', category: 'write', riskLevel: 'medium', dependsOn: ['view_users'] },
  { name: 'delete_users', displayName: 'Delete Users', module: 'users', action: 'delete', description: 'Delete users', category: 'delete', riskLevel: 'high', dependsOn: ['view_users'] },
  { name: 'assign_roles', displayName: 'Assign Roles', module: 'users', action: 'assign', description: 'Assign roles to users', category: 'admin', riskLevel: 'high', dependsOn: ['view_users', 'view_roles'] },
  // Roles & permissions
  { name: 'manage_roles', displayName: 'Manage Roles', module: 'roles', action: 'manage', description: 'Create, edit, delete roles and manage permissions', category: 'admin', riskLevel: 'high', dependsOn: ['view_roles'] },
  { name: 'view_roles', displayName: 'View Roles', module: 'roles', action: 'view', description: 'View roles and permissions', category: 'read', riskLevel: 'low', dependsOn: [] },
  // Access & audit
  { name: 'view_access_logs', displayName: 'View Access Logs', module: 'audit', action: 'view', description: 'View access logs and sessions', category: 'read', riskLevel: 'medium', dependsOn: [] },
  // Stores & master data
  { name: 'manage_stores', displayName: 'Manage Stores', module: 'master_data', action: 'manage', description: 'Create and manage stores', category: 'admin', riskLevel: 'medium', dependsOn: ['view_stores'] },
  { name: 'view_stores', displayName: 'View Stores', module: 'master_data', action: 'view', description: 'View stores and warehouses', category: 'read', riskLevel: 'low', dependsOn: [] },
  // Customers
  { name: 'view_customers', displayName: 'View Customers', module: 'customers', action: 'view', description: 'View customer data', category: 'read', riskLevel: 'low', dependsOn: [] },
  { name: 'manage_customers', displayName: 'Manage Customers', module: 'customers', action: 'manage', description: 'Edit and manage customers', category: 'write', riskLevel: 'medium', dependsOn: ['view_customers'] },
  // Fraud & compliance
  { name: 'view_fraud', displayName: 'View Fraud Alerts', module: 'fraud', action: 'view', description: 'View fraud alerts and investigations', category: 'read', riskLevel: 'medium', dependsOn: [] },
  { name: 'manage_fraud', displayName: 'Manage Fraud', module: 'fraud', action: 'manage', description: 'Manage fraud alerts and blocked entities', category: 'admin', riskLevel: 'high', dependsOn: ['view_fraud'] },
];

const ROLE_TEMPLATES = [
  {
    name: 'Super Admin',
    description: 'Full unrestricted access across all modules.',
    templateKey: 'super_admin',
    roleType: 'system',
    isTemplate: true,
    isSystemTemplate: true,
    accessScope: 'global',
    riskLevel: 'high',
    permissions: ['*'],
  },
  {
    name: 'Admin',
    description: 'Administrative control with broad operations permissions.',
    templateKey: 'admin',
    roleType: 'system',
    isTemplate: true,
    isSystemTemplate: true,
    accessScope: 'global',
    riskLevel: 'high',
    permissions: ['view_users', 'create_users', 'edit_users', 'delete_users', 'assign_roles', 'manage_roles', 'view_roles', 'view_access_logs'],
  },
  {
    name: 'Manager',
    description: 'Manages team operations without destructive administration rights.',
    templateKey: 'manager',
    roleType: 'system',
    isTemplate: true,
    isSystemTemplate: true,
    accessScope: 'zone',
    riskLevel: 'medium',
    permissions: ['view_users', 'edit_users', 'view_roles', 'view_access_logs', 'view_stores', 'view_customers', 'manage_customers', 'view_fraud'],
  },
  {
    name: 'Viewer',
    description: 'Read-only visibility for audits and monitoring.',
    templateKey: 'viewer',
    roleType: 'system',
    isTemplate: true,
    isSystemTemplate: true,
    accessScope: 'store',
    riskLevel: 'low',
    permissions: ['view_users', 'view_roles', 'view_access_logs', 'view_stores', 'view_customers', 'view_fraud'],
  },
];

async function seedPermissions() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-admin-ops';
    await mongoose.connect(uri);
    logger.info('MongoDB connected for permissions seed');

    let created = 0;
    let skipped = 0;

    for (const perm of DEFAULT_PERMISSIONS) {
      const existing = await Permission.findOne({ name: perm.name });
      if (existing) {
        skipped++;
        continue;
      }
      await Permission.create(perm);
      created++;
      logger.info(`Created permission: ${perm.name}`);
    }

    logger.info(`\nPermissions seed completed. Created: ${created}, Skipped: ${skipped}`);

    const allPermissionNames = (await Permission.find({ isActive: true }).select('name').lean())
      .map((perm) => perm.name);
    let templatesCreated = 0;
    let templatesUpdated = 0;
    for (const template of ROLE_TEMPLATES) {
      const resolvedPermissions = template.permissions.includes('*')
        ? allPermissionNames
        : template.permissions;
      const existingTemplate = await Role.findOne({ templateKey: template.templateKey });
      if (!existingTemplate) {
        await Role.create({
          ...template,
          permissions: resolvedPermissions,
          templateVersion: 1,
          isActive: true,
        });
        templatesCreated += 1;
      } else {
        existingTemplate.description = template.description;
        existingTemplate.roleType = template.roleType;
        existingTemplate.isTemplate = true;
        existingTemplate.isSystemTemplate = template.isSystemTemplate;
        existingTemplate.accessScope = template.accessScope;
        existingTemplate.riskLevel = template.riskLevel;
        existingTemplate.permissions = resolvedPermissions;
        existingTemplate.isActive = true;
        existingTemplate.templateVersion = (existingTemplate.templateVersion || 1) + 1;
        await existingTemplate.save();
        templatesUpdated += 1;
      }
    }
    logger.info(`Role template seed completed. Created: ${templatesCreated}, Updated: ${templatesUpdated}`);
  } catch (err) {
    logger.error('Permissions seed failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
  process.exit(0);
}

seedPermissions();
