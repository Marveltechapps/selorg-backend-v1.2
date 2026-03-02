module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  slaThresholdSeconds: parseInt(process.env.DEFAULT_SLA_THRESHOLD_SECONDS) || 1200,
  cache: {
    // Shared / existing
    dashboard: parseInt(process.env.CACHE_TTL_DASHBOARD) || 15,
    riders: parseInt(process.env.CACHE_TTL_RIDERS) || 15,
    location: parseInt(process.env.CACHE_TTL_LOCATION) || 5,
    alerts: parseInt(process.env.CACHE_TTL_ALERTS) || 30,
    systemHealth: parseInt(process.env.CACHE_TTL_SYSTEM_HEALTH) || 60,
    analytics: parseInt(process.env.CACHE_TTL_ANALYTICS) || 120,
    approvals: parseInt(process.env.CACHE_TTL_APPROVALS) || 30,
    staff: parseInt(process.env.CACHE_TTL_STAFF) || 30,
    default: parseInt(process.env.CACHE_TTL_DEFAULT) || 60,
    // Admin
    admin: {
      users: parseInt(process.env.CACHE_TTL_ADMIN_USERS) || 60,
      roles: parseInt(process.env.CACHE_TTL_ADMIN_ROLES) || 120,
      permissions: parseInt(process.env.CACHE_TTL_ADMIN_PERMISSIONS) || 120,
      stores: parseInt(process.env.CACHE_TTL_ADMIN_STORES) || 60,
      audit: parseInt(process.env.CACHE_TTL_ADMIN_AUDIT) || 60,
      default: parseInt(process.env.CACHE_TTL_ADMIN) || 60,
    },
    // Finance
    finance: {
      summary: parseInt(process.env.CACHE_TTL_FINANCE_SUMMARY) || 15,
      payments: parseInt(process.env.CACHE_TTL_FINANCE_PAYMENTS) || 30,
      refunds: parseInt(process.env.CACHE_TTL_FINANCE_REFUNDS) || 30,
      reconciliation: parseInt(process.env.CACHE_TTL_FINANCE_RECONCILIATION) || 60,
      ledger: parseInt(process.env.CACHE_TTL_FINANCE_LEDGER) || 60,
      invoices: parseInt(process.env.CACHE_TTL_FINANCE_INVOICES) || 60,
      analytics: parseInt(process.env.CACHE_TTL_FINANCE_ANALYTICS) || 120,
      approvals: parseInt(process.env.CACHE_TTL_FINANCE_APPROVALS) || 30,
      default: parseInt(process.env.CACHE_TTL_FINANCE) || 60,
    },
    // Vendor, warehouse, production, darkstore, merch
    vendor: parseInt(process.env.CACHE_TTL_VENDOR) || 60,
    warehouse: parseInt(process.env.CACHE_TTL_WAREHOUSE) || 60,
    production: parseInt(process.env.CACHE_TTL_PRODUCTION) || 60,
    darkstore: parseInt(process.env.CACHE_TTL_DARKSTORE) || 60,
    merch: parseInt(process.env.CACHE_TTL_MERCH) || 60,
    // Shared (additional)
    search: parseInt(process.env.CACHE_TTL_SEARCH) || 30,
    communication: parseInt(process.env.CACHE_TTL_COMMUNICATION) || 30,
    inventorySync: parseInt(process.env.CACHE_TTL_INVENTORY_SYNC) || 30,
    bulk: parseInt(process.env.CACHE_TTL_BULK) || 60,
    automation: parseInt(process.env.CACHE_TTL_AUTOMATION) || 60,
    // HHD, Picker, Customer
    hhd: {
      dashboard: parseInt(process.env.CACHE_TTL_HHD_DASHBOARD) || 15,
      default: parseInt(process.env.CACHE_TTL_HHD) || 30,
    },
    picker: {
      locations: parseInt(process.env.CACHE_TTL_PICKER_LOCATIONS) || 60,
      training: parseInt(process.env.CACHE_TTL_PICKER_TRAINING) || 120,
      default: parseInt(process.env.CACHE_TTL_PICKER) || 60,
    },
    customer: {
      home: parseInt(process.env.CACHE_TTL_CUSTOMER_HOME) || 60,
      categories: parseInt(process.env.CACHE_TTL_CUSTOMER_CATEGORIES) || 120,
      products: parseInt(process.env.CACHE_TTL_CUSTOMER_PRODUCTS) || 60,
      legal: parseInt(process.env.CACHE_TTL_CUSTOMER_LEGAL) || 300,
      default: parseInt(process.env.CACHE_TTL_CUSTOMER) || 60,
    },
  },
  disableCache: process.env.DISABLE_CACHE === 'true',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Increased for development/testing
  },
};

