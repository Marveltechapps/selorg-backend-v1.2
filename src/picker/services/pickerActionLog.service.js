/**
 * Picker Action Log service – logs picker actions for audit.
 * Action types: attendance (punch_in, punch_out, break), order updates (start_picking, complete),
 * issue_report, withdrawal_request, device_return, bag_rack_assigned.
 */
const PickerActionLog = require('../models/pickerActionLog.model');

async function logPickerAction({ actionType, pickerId, orderId, metadata = {} }) {
  const doc = await PickerActionLog.create({
    actionType,
    pickerId: String(pickerId),
    orderId: orderId ? String(orderId) : undefined,
    metadata,
  });
  return doc;
}

async function getLogsByPicker(pickerId, { startDate, endDate, actionType, limit = 50 } = {}) {
  const query = { pickerId: String(pickerId) };
  if (startDate) query.timestamp = { ...(query.timestamp || {}), $gte: new Date(startDate) };
  if (endDate) query.timestamp = { ...(query.timestamp || {}), $lte: new Date(endDate) };
  if (actionType) query.actionType = actionType;

  const logs = await PickerActionLog.find(query)
    .sort({ timestamp: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean();
  return logs;
}

async function getLogsByOrder(orderId, { limit = 50 } = {}) {
  const logs = await PickerActionLog.find({ orderId: String(orderId) })
    .sort({ timestamp: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean();
  return logs;
}

module.exports = { logPickerAction, getLogsByPicker, getLogsByOrder };
