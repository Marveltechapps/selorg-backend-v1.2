const GRN = require('../models/GRN');
const PurchaseOrder = require('../models/PurchaseOrder');
const QCCheck = require('../models/QCCheck');
const Alert = require('../models/Alert');

async function getPerformance(vendorId, opts = {}) {
  // basic performance calculation: SLA is stored on vendor but we compute simple metrics
  const filter = { vendorId };
  const totalGRNs = await GRN.countDocuments(filter);
  const approvedGRNs = await GRN.countDocuments(Object.assign({}, filter, { status: 'APPROVED' }));
  const rejectedGRNs = await GRN.countDocuments(Object.assign({}, filter, { status: 'REJECTED' }));
  const qcPassed = await QCCheck.countDocuments(Object.assign({}, filter, { status: 'passed' }));
  const qcFailed = await QCCheck.countDocuments(Object.assign({}, filter, { status: 'failed' }));
  const complaints = await Alert.countDocuments(Object.assign({}, filter, { type: 'COMPLAINT' }));

  const sla = totalGRNs === 0 ? 100 : Math.round(((approvedGRNs) / Math.max(1, totalGRNs)) * 10000) / 100;

  return {
    vendorId,
    sla,
    onTimeDeliveryRate: sla, // best-effort proxy
    complaintsLast30d: complaints,
    score: Math.round(((sla + (100 - qcFailed)) / 2) * 100) / 100,
    timeseries: [], // not implemented: would aggregate by day/week/month
  };
}

async function getHealth(vendorId) {
  const openAlerts = await Alert.countDocuments({ vendorId, status: 'open' });
  const recentHealthCheck = new Date();
  return {
    vendorId,
    overallStatus: openAlerts > 5 ? 'degraded' : openAlerts > 0 ? 'degraded' : 'healthy',
    lastHealthCheck: recentHealthCheck,
    openAlertsCount: openAlerts,
    recentAlerts: await Alert.find({ vendorId }).sort({ createdAt: -1 }).limit(5).lean(),
  };
}

module.exports = { getPerformance, getHealth };

