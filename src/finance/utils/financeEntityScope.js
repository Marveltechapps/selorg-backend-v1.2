/**
 * Finance dashboard queries: live data is often stored under entityId "default"
 * while the UI may pass the operator's store id — include both in reads.
 */

function normalizeEntityId(entityId) {
  const id = String(entityId ?? '').trim();
  return id || 'default';
}

function entityIdsForQuery(entityId) {
  const id = normalizeEntityId(entityId);
  const ids = new Set([id]);
  if (id !== 'default') ids.add('default');
  return [...ids];
}

function buildEntityFilter(entityId) {
  const ids = entityIdsForQuery(entityId);
  return ids.length === 1 ? { entityId: ids[0] } : { entityId: { $in: ids } };
}

/** Local calendar day for the given date param (ISO string or Date). */
function buildDayRange(dateInput) {
  const target = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(target.getTime())) {
    const now = new Date();
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    };
  }
  return {
    startDate: new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0, 0),
    endDate: new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999),
  };
}

/** Gross received volume from live transactions (matches live feed / order creation). */
const RECEIVED_TXN_STATUSES = ['success', 'pending'];

function isReceivedTxn(txn) {
  return RECEIVED_TXN_STATUSES.includes(txn?.status);
}

module.exports = {
  normalizeEntityId,
  entityIdsForQuery,
  buildEntityFilter,
  buildDayRange,
  RECEIVED_TXN_STATUSES,
  isReceivedTxn,
};
