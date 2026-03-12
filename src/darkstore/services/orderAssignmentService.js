/**
 * Order Assignment Engine
 * Supports: MANUAL_ASSIGN, ROUND_ROBIN, ZONE_BASED, PICKER_CAPACITY, AUTO_ASSIGN
 */
const PickerUser = require('../../picker/models/user.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');
const { deriveWorkerStatus } = require('../../picker/controllers/heartbeat.controller');
const { WORKER_STATUS } = require('../../constants/pickerEnums');
const { getPickerIdsInActiveShift } = require('./activeShiftHelper');

const HEARTBEAT_OFFLINE_MS = 60 * 1000;

/** Assignment strategy from env or default. Use AUTO_ASSIGN for auto-assign on new orders. */
function getStrategy() {
  return (process.env.ORDER_ASSIGNMENT_STRATEGY || 'AUTO_ASSIGN').toUpperCase();
}

/**
 * Get available pickers (ACTIVE, in active shift, online, AVAILABLE or PICKING with capacity)
 * Only includes pickers who have punched in (active shift).
 * @param {string} storeId - optional store filter
 * @returns {Promise<Array<{id, name, activeOrderId, lastSeenAt}>>}
 */
async function getAvailablePickers(storeId = null) {
  const query = { status: PICKER_STATUS.ACTIVE };
  if (storeId) query.currentLocationId = storeId;

  const [pickers, inShiftIds] = await Promise.all([
    PickerUser.find(query)
      .select('name phone lastSeenAt activeOrderId onBreak currentLocationId')
      .lean(),
    getPickerIdsInActiveShift(),
  ]);

  const now = Date.now();
  return pickers
    .filter((p) => inShiftIds.has(String(p._id)))
    .filter((p) => {
      const status = deriveWorkerStatus(p, now);
      return status === WORKER_STATUS.AVAILABLE || status === WORKER_STATUS.PICKING;
    })
    .map((p) => ({
      id: String(p._id),
      name: p.name || p.phone || 'Unknown',
      activeOrderId: p.activeOrderId || null,
      lastSeenAt: p.lastSeenAt,
      storeId: p.currentLocationId,
    }));
}

/**
 * Assign order to best available picker by strategy
 * @param {string} orderId
 * @param {string} storeId
 * @param {object} order - optional order doc for zone/priority
 * @returns {{ pickerId: string, pickerName: string } | null}
 */
async function assignToBestPicker(orderId, storeId, order = {}) {
  const strategy = getStrategy();
  if (strategy === 'MANUAL_ASSIGN') return null;

  const pickers = await getAvailablePickers(storeId);
  if (pickers.length === 0) return null;

  if (strategy === 'ROUND_ROBIN' || strategy === 'AUTO_ASSIGN') {
    // Prefer free (no active order) pickers
    const free = pickers.filter((p) => !p.activeOrderId);
    const preferred = free.length > 0 ? free : pickers;
    return preferred[0];
  }

  if (strategy === 'PICKER_CAPACITY') {
    const withOrders = pickers.filter((p) => p.activeOrderId);
    const withoutOrders = pickers.filter((p) => !p.activeOrderId);
    const preferred = withoutOrders.length > 0 ? withoutOrders : withOrders;
    return preferred[0];
  }

  if (strategy === 'ZONE_BASED') {
    const orderZone = order.zone || order.sla_status;
    const scored = pickers.map((p) => ({
      picker: p,
      score: p.storeId === storeId ? 10 : 0,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.picker || pickers[0];
  }

  return pickers[0];
}

module.exports = {
  getStrategy,
  getAvailablePickers,
  assignToBestPicker,
};
