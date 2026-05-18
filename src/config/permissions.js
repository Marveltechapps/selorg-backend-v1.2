/**
 * Central permission registry — Phase A RBAC
 * Format: {domain}.{resource}.{action} (see PERMISSION_NAMING_CONVENTION.md)
 */

/** @type {Record<string, string>} */
const PERMISSIONS = Object.freeze({
  // Admin / platform
  ADMIN_USERS_READ: 'admin.users.read',
  ADMIN_USERS_WRITE: 'admin.users.write',
  ADMIN_ROLES_READ: 'admin.roles.read',
  ADMIN_ROLES_WRITE: 'admin.roles.write',
  ADMIN_CONFIG_READ: 'admin.config.read',
  ADMIN_CONFIG_WRITE: 'admin.config.write',

  // Catalog
  CATALOG_PRODUCTS_READ: 'catalog.products.read',
  CATALOG_PRODUCTS_WRITE: 'catalog.products.write',
  CATALOG_CATEGORIES_READ: 'catalog.categories.read',
  CATALOG_CATEGORIES_WRITE: 'catalog.categories.write',

  // Inventory
  INVENTORY_STOCK_READ: 'inventory.stock.read',
  INVENTORY_STOCK_WRITE: 'inventory.stock.write',
  INVENTORY_ADJUSTMENT_CREATE: 'inventory.adjustment.create',
  INVENTORY_ADJUSTMENT_APPROVE: 'inventory.adjustment.approve',

  // Orders
  ORDERS_READ: 'orders.read',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_REFUND: 'orders.refund',

  // Delivery / logistics
  DELIVERY_ASSIGN: 'delivery.assign',
  DELIVERY_TRACK_READ: 'delivery.track.read',

  // Payments / finance
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_REFUND: 'payments.refund',

  // Pricing / promotions (merch hub)
  PRICING_READ: 'pricing.read',
  PRICING_OVERRIDE: 'pricing.override',

  // Merch allocation / transfers originating from merch
  MERCH_ALLOCATION_READ: 'merch.allocation.read',
  MERCH_ALLOCATION_WRITE: 'merch.allocation.write',

  // Warehouse
  WAREHOUSE_TRANSFER_READ: 'warehouse.transfer.read',
  WAREHOUSE_TRANSFER_CREATE: 'warehouse.transfer.create',
  WAREHOUSE_TRANSFER_APPROVE: 'warehouse.transfer.approve',

  // Analytics
  ANALYTICS_REPORTS_READ: 'analytics.reports.read',

  // Compliance
  COMPLIANCE_AUDIT_READ: 'compliance.audit.read',
});

/**
 * Default permissions when JWT has no `permissions` array (legacy tokens).
 * Keys are normalized roles (lowercase, underscores).
 */
const ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  super_admin: ['*'],
  superadmin: ['*'],
  admin: ['*'],
  darkstore: [
    'inventory.*',
    'orders.*',
    'catalog.products.read',
    'catalog.categories.read',
    'delivery.track.read',
    'analytics.reports.read',
    'operations.*',
  ],
  store_manager: ['inventory.*', 'orders.read', 'orders.cancel', 'analytics.reports.read'],
  warehouse_ops: [
    'warehouse.transfer.read',
    'warehouse.transfer.create',
    'warehouse.transfer.approve',
    'inventory.stock.read',
    'inventory.stock.write',
  ],
  category_manager: ['catalog.*'],
  support_agent: ['orders.read', 'orders.refund', 'payments.read', 'delivery.track.read'],
  finance: ['payments.*', 'orders.read', 'analytics.reports.read'],
  /** Merch hub: catalog + pricing + allocation tooling */
  merch: [
    'catalog.*',
    'pricing.*',
    'merch.allocation.*',
    'warehouse.transfer.create',
    'analytics.reports.read',
  ],
  /** Warehouse module JWT role */
  warehouse: ['warehouse.*', 'inventory.stock.read', 'inventory.stock.write'],
  picker: ['inventory.stock.read', 'orders.read', 'operations.picking.*'],
  rider: ['delivery.*', 'orders.read'],
  hhd: ['inventory.stock.read', 'orders.read'],
});

function normalizeRoleKey(role) {
  if (!role) return '';
  return String(role).toLowerCase().trim().replace(/\s+/g, '_').replace(/-/g, '_');
}

/**
 * @param {string} [role]
 * @returns {string[]}
 */
function getDefaultPermissionsForRole(role) {
  const key = normalizeRoleKey(role);
  if (!key) return [];
  return [...(ROLE_DEFAULT_PERMISSIONS[key] || [])];
}

/**
 * True if a single granted permission string satisfies `required`.
 * Supports `*` and prefix wildcards e.g. `inventory.*`.
 * @param {string} granted
 * @param {string} required
 */
function permissionMatches(granted, required) {
  if (!granted || !required) return false;
  if (granted === '*') return true;
  if (granted === required) return true;
  if (granted.endsWith('.*')) {
    const prefix = granted.slice(0, -1);
    return required.startsWith(prefix);
  }
  return false;
}

/**
 * Legacy seed / JWT permission names (see seedPermissions.js) mapped to Phase A canonical keys.
 * @param {string} granted
 * @param {string} required
 */
function legacyAliasMatches(granted, required) {
  const g = String(granted);
  if (g === 'manage_roles') {
    return required === PERMISSIONS.ADMIN_ROLES_READ || required === PERMISSIONS.ADMIN_ROLES_WRITE;
  }
  if (g === 'view_users' && required === PERMISSIONS.ADMIN_USERS_READ) return true;
  if (
    ['create_users', 'edit_users', 'delete_users'].includes(g) &&
    required === PERMISSIONS.ADMIN_USERS_WRITE
  ) {
    return true;
  }
  if (g === 'assign_roles' && required === PERMISSIONS.ADMIN_ROLES_WRITE) return true;
  if (g === 'view_access_logs' && required === PERMISSIONS.COMPLIANCE_AUDIT_READ) return true;
  return false;
}

/**
 * @param {string[]} userPermissions
 * @param {string} required
 */
function userHasPermission(userPermissions, required) {
  if (!Array.isArray(userPermissions) || userPermissions.length === 0) return false;
  return userPermissions.some(
    (p) => permissionMatches(p, required) || legacyAliasMatches(p, required)
  );
}

/**
 * @param {string[]} userPermissions
 * @param {string[]} requiredList
 */
function userHasAllPermissions(userPermissions, requiredList) {
  return requiredList.every((r) => userHasPermission(userPermissions, r));
}

module.exports = {
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  normalizeRoleKey,
  getDefaultPermissionsForRole,
  permissionMatches,
  legacyAliasMatches,
  userHasPermission,
  userHasAllPermissions,
};
