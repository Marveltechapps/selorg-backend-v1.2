const Alert = require('../models/Alert');
const { mergeHubFilter, hubFieldsForCreate } = require('../constants/hubScope');

async function listAlerts(query = {}) {
  const filter = {};
  if (query.vendorId) filter.vendorId = query.vendorId;
  if (query.status && query.status !== 'all') filter.status = query.status;
  const data = await Alert.find(mergeHubFilter(filter)).lean();
  return data;
}

async function createAlert(payload) {
  const a = new Alert({
    ...hubFieldsForCreate(),
    vendorId: payload.vendorId,
    type: payload.type,
    severity: payload.severity || 'low',
    message: payload.message,
    acknowledgedBy: payload.acknowledgedBy,
  });
  await a.save();
  return a.toObject();
}

module.exports = { listAlerts, createAlert };

