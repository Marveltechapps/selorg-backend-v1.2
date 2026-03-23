const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Default procurement / dashboard tenant. Override with env for other default hubs.
 */
const DEFAULT_HUB_KEY =
  (process.env.DASHBOARD_HUB_KEY && String(process.env.DASHBOARD_HUB_KEY).trim()) || 'chennai-hub';

const vendorHubStorage = new AsyncLocalStorage();

function getDefaultHubKey() {
  return DEFAULT_HUB_KEY;
}

/**
 * Resolve hub from a persisted user document (Mongo). Used at login / JWT issuance.
 */
function resolveHubKeyFromUserDoc(user) {
  if (!user) return DEFAULT_HUB_KEY;
  const fromHubKey = user.hubKey && String(user.hubKey).trim();
  if (fromHubKey) return fromHubKey;
  const fromPrimary = user.primaryStoreId && String(user.primaryStoreId).trim();
  if (fromPrimary) return fromPrimary;
  if (Array.isArray(user.assignedStores) && user.assignedStores.length > 0) {
    const first = user.assignedStores[0];
    if (first && String(first).trim()) return String(first).trim();
  }
  return DEFAULT_HUB_KEY;
}

/**
 * Run the rest of the middleware/route chain with a vendor hub scope (per request).
 */
function runWithVendorHub(hubKey, callback) {
  const k = hubKey && String(hubKey).trim() ? String(hubKey).trim() : DEFAULT_HUB_KEY;
  return vendorHubStorage.run({ hubKey: k }, callback);
}

function getEffectiveHubKey() {
  const store = vendorHubStorage.getStore();
  return (store && store.hubKey) || DEFAULT_HUB_KEY;
}

/**
 * Documents without hubKey are treated as belonging to the default hub only (legacy Chennai data).
 * Other hubs require an explicit hubKey on documents.
 */
function hubKeyMatch() {
  const k = getEffectiveHubKey();
  if (k === DEFAULT_HUB_KEY) {
    return {
      $or: [{ hubKey: DEFAULT_HUB_KEY }, { hubKey: { $exists: false } }, { hubKey: null }],
    };
  }
  return { hubKey: k };
}

/**
 * Merge tenant scope into a Mongo filter. Preserves callers that already use $and.
 */
function mergeHubFilter(baseFilter = {}) {
  const base = baseFilter && typeof baseFilter === 'object' ? { ...baseFilter } : {};
  const hub = hubKeyMatch();
  if (Object.keys(base).length === 0) return hub;
  return { $and: [base, hub] };
}

function hubFieldsForCreate() {
  return { hubKey: getEffectiveHubKey() };
}

module.exports = {
  getDefaultHubKey,
  getEffectiveHubKey,
  resolveHubKeyFromUserDoc,
  runWithVendorHub,
  mergeHubFilter,
  hubFieldsForCreate,
  hubKeyMatch,
};
