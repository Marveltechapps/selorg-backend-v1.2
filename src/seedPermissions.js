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
const logger = require('./core/utils/logger');

const DEFAULT_PERMISSIONS = [
  // User management
  { name: 'view_users', displayName: 'View Users', module: 'users', description: 'View user list and details', category: 'read' },
  { name: 'create_users', displayName: 'Create Users', module: 'users', description: 'Create new users', category: 'write' },
  { name: 'edit_users', displayName: 'Edit Users', module: 'users', description: 'Edit existing users', category: 'write' },
  { name: 'delete_users', displayName: 'Delete Users', module: 'users', description: 'Delete users', category: 'delete' },
  { name: 'assign_roles', displayName: 'Assign Roles', module: 'users', description: 'Assign roles to users', category: 'admin' },
  // Roles & permissions
  { name: 'manage_roles', displayName: 'Manage Roles', module: 'roles', description: 'Create, edit, delete roles and manage permissions', category: 'admin' },
  { name: 'view_roles', displayName: 'View Roles', module: 'roles', description: 'View roles and permissions', category: 'read' },
  // Access & audit
  { name: 'view_access_logs', displayName: 'View Access Logs', module: 'audit', description: 'View access logs and sessions', category: 'read' },
  // Stores & master data
  { name: 'manage_stores', displayName: 'Manage Stores', module: 'master_data', description: 'Create and manage stores', category: 'admin' },
  { name: 'view_stores', displayName: 'View Stores', module: 'master_data', description: 'View stores and warehouses', category: 'read' },
  // Customers
  { name: 'view_customers', displayName: 'View Customers', module: 'customers', description: 'View customer data', category: 'read' },
  { name: 'manage_customers', displayName: 'Manage Customers', module: 'customers', description: 'Edit and manage customers', category: 'write' },
  // Fraud & compliance
  { name: 'view_fraud', displayName: 'View Fraud Alerts', module: 'fraud', description: 'View fraud alerts and investigations', category: 'read' },
  { name: 'manage_fraud', displayName: 'Manage Fraud', module: 'fraud', description: 'Manage fraud alerts and blocked entities', category: 'admin' },
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
  } catch (err) {
    logger.error('Permissions seed failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
  process.exit(0);
}

seedPermissions();
