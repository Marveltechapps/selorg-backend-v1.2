/**
 * Resolve dashboard store id (e.g. DS-Adyar-01) to all PickerUser location keys
 * (ObjectId currentLocationId, store code, membership storeId).
 */
const mongoose = require('mongoose');
const Store = require('../../merch/models/Store');
const PickerUser = require('../../picker/models/user.model');
const WorkLocation = require('../../picker/models/workLocation.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');
const pickerDarkStoreService = require('../../picker/services/pickerDarkStore.service');

const DEFAULT_STORE_CODE = (process.env.DEFAULT_STORE_ID || 'DS-Adyar-01').trim().toUpperCase();

/**
 * @param {string|null|undefined} storeIdInput
 * @returns {Promise<Set<string>>}
 */
async function resolvePickerStoreIds(storeIdInput) {
  const ids = new Set();
  const raw = String(storeIdInput || '').trim();
  if (!raw) return ids;

  ids.add(raw);
  const upper = raw.toUpperCase();
  if (upper !== raw) ids.add(upper);

  if (mongoose.Types.ObjectId.isValid(raw)) {
    ids.add(String(raw));
  }

  try {
    const meta = await pickerDarkStoreService.resolveDarkStoreMeta(raw);
    if (meta?.storeId) ids.add(String(meta.storeId));
  } catch (_) {
    /* store code may not resolve via location service */
  }

  const storeOr = [{ code: upper }];
  if (mongoose.Types.ObjectId.isValid(raw)) {
    storeOr.unshift({ _id: raw });
  }
  const store = await Store.findOne({
    $or: storeOr,
    type: { $in: ['warehouse', 'dark_store', 'store'] },
  })
    .select('_id code')
    .lean();
  if (store) {
    ids.add(String(store._id));
    if (store.code) ids.add(String(store.code).toUpperCase());
  }

  const workLocation = await WorkLocation.findOne({
    isActive: true,
    $or: [{ locationId: raw }, { locationId: upper }],
  })
    .select('locationId')
    .lean();
  if (workLocation?.locationId) ids.add(String(workLocation.locationId));

  const legacyPickerLoc = process.env.DEFAULT_PICKER_LOCATION_ID;
  if (legacyPickerLoc && (upper === DEFAULT_STORE_CODE || raw === process.env.DEFAULT_STORE_ID)) {
    ids.add(String(legacyPickerLoc).trim());
  }

  // Legacy dashboard code (e.g. DS-Adyar-01) often differs from picker currentLocationId (ObjectId).
  // When no Store/location row matches, include all active picker work sites so assign works in dev.
  if (upper === DEFAULT_STORE_CODE && ids.size <= 2) {
    const locations = await PickerUser.distinct('currentLocationId', {
      status: PICKER_STATUS.ACTIVE,
      currentLocationId: { $exists: true, $nin: [null, ''] },
    });
    for (const loc of locations) ids.add(String(loc));
  }

  return ids;
}

/**
 * Mongo filter for PickerUser documents at a dark store.
 * @param {string|null|undefined} storeIdInput
 * @returns {Promise<object|null>} null = no store filter
 */
async function buildPickerUserStoreFilter(storeIdInput) {
  const ids = await resolvePickerStoreIds(storeIdInput);
  if (ids.size === 0) return null;

  const idList = [...ids];
  const or = [{ currentLocationId: { $in: idList } }];

  const objectIds = idList
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (objectIds.length > 0) {
    or.push({ storeId: { $in: objectIds } });
  }

  return { $or: or };
}

module.exports = {
  resolvePickerStoreIds,
  buildPickerUserStoreFilter,
};
