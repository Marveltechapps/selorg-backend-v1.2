/**
 * Warehouse tenant scoping helper.
 *
 * Goal: 100% hub isolation by requiring every warehouse-owned document
 * read/write/query to include a `warehouseKey` constraint.
 *
 * Legacy behavior: for the default key, documents that have missing/null
 * `warehouseKey` are treated as belonging to the default hub.
 */

const DEFAULT_WAREHOUSE_KEY =
  (process.env.DASHBOARD_WAREHOUSE_KEY &&
    String(process.env.DASHBOARD_WAREHOUSE_KEY).trim()) ||
  (process.env.DASHBOARD_HUB_KEY && String(process.env.DASHBOARD_HUB_KEY).trim()) ||
  'chennai-hub';

function normalizeWarehouseKey(warehouseKey) {
  const k =
    warehouseKey && typeof warehouseKey === 'string'
      ? warehouseKey.trim()
      : warehouseKey == null
        ? ''
        : String(warehouseKey).trim();
  return k || DEFAULT_WAREHOUSE_KEY;
}

function warehouseKeyMatch(warehouseKey) {
  const k = normalizeWarehouseKey(warehouseKey);

  // Legacy compatibility for default hub.
  if (k === DEFAULT_WAREHOUSE_KEY) {
    return {
      $or: [
        { warehouseKey: DEFAULT_WAREHOUSE_KEY },
        { warehouseKey: { $exists: false } },
        { warehouseKey: null },
      ],
    };
  }

  return { warehouseKey: k };
}

function mergeWarehouseFilter(baseFilter = {}, warehouseKey) {
  const base =
    baseFilter && typeof baseFilter === 'object' ? { ...baseFilter } : {};

  // Keep exact semantics for already-merged filters (callers may include $and).
  if (Object.keys(base).length === 0) {
    return warehouseKeyMatch(warehouseKey);
  }

  return { $and: [base, warehouseKeyMatch(warehouseKey)] };
}

function warehouseFieldsForCreate(warehouseKey) {
  return { warehouseKey: normalizeWarehouseKey(warehouseKey) };
}

module.exports = {
  DEFAULT_WAREHOUSE_KEY,
  normalizeWarehouseKey,
  warehouseKeyMatch,
  mergeWarehouseFilter,
  warehouseFieldsForCreate,
};

