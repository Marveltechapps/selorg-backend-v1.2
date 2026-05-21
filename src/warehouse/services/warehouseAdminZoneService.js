const mongoose = require('mongoose');
const Store = require('../../merch/models/Store');
const Zone = require('../../merch/models/Zone');
const { normalizeWarehouseKey } = require('../constants/warehouseScope');

const ACTIVE_ZONE_STATUSES = ['Active', 'active'];

/**
 * Resolve the admin Store (type=warehouse) for a warehouse dashboard tenant key.
 */
async function resolveWarehouseStore(warehouseKey) {
  const key = normalizeWarehouseKey(warehouseKey);
  const or = [];

  if (mongoose.Types.ObjectId.isValid(key) && key.length === 24) {
    or.push({ _id: new mongoose.Types.ObjectId(key) });
  }

  const upper = key.toUpperCase();
  or.push({ code: upper }, { code: key });

  const hubSlug = key.replace(/-hub$/i, '').trim();
  if (hubSlug && hubSlug !== key) {
    const compact = hubSlug.replace(/[\s_-]+/g, '');
    or.push(
      { name: new RegExp(hubSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { code: new RegExp(compact, 'i') }
    );
  }

  const spaced = key.replace(/-/g, ' ').trim();
  if (spaced) {
    or.push({ name: new RegExp(spaced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
  }

  const store = await Store.findOne({ type: 'warehouse', $or: or })
    .select('_id code name cityId zoneId zones metadata')
    .lean();

  if (store) return store;

  return Store.findOne({ type: 'warehouse', status: 'active' })
    .sort({ updatedAt: -1 })
    .select('_id code name cityId zoneId zones metadata')
    .lean();
}

/**
 * Zones configured in Admin → Master Data (merch Zone collection).
 * Scoped to the warehouse store's city when available.
 */
async function listAdminZonesForWarehouse(warehouseKey) {
  const store = await resolveWarehouseStore(warehouseKey);
  const filter = {
    status: { $in: ACTIVE_ZONE_STATUSES },
    $or: [{ isVisible: true }, { isVisible: { $exists: false } }],
  };

  if (store?.cityId) {
    filter.cityId = store.cityId;
  }

  const zones = await Zone.find(filter).sort({ name: 1 }).select('_id name code status').lean();

  return zones.map((z) => ({
    id: z._id.toString(),
    name: z.name,
    code: z.code || null,
  }));
}

module.exports = {
  resolveWarehouseStore,
  listAdminZonesForWarehouse,
};
