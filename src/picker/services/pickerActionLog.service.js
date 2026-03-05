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

async function getAllLogs({ pickerId, orderId, actionType, startDate, endDate, page = 1, limit = 50 } = {}) {
  const query = {};
  if (pickerId) query.pickerId = String(pickerId);
  if (orderId) query.orderId = String(orderId);
  if (actionType) query.actionType = actionType;
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  const skip = (Math.max(1, Number(page)) - 1) * Math.min(Number(limit) || 50, 200);
  const [logs, total] = await Promise.all([
    PickerActionLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(Math.min(Number(limit) || 50, 200)).lean(),
    PickerActionLog.countDocuments(query),
  ]);
  return { logs, total, page: Number(page), limit: Math.min(Number(limit) || 50, 200), pages: Math.ceil(total / (Number(limit) || 50)) };
}

module.exports = { logPickerAction, getLogsByPicker, getLogsByOrder, getAllLogs };
