const GRN = require('../models/GRN');
const PurchaseOrder = require('../models/PurchaseOrder');
const QCCheck = require('../models/QCCheck');
const Alert = require('../models/Alert');
const { mergeHubFilter } = require('../constants/hubScope');

const PASSED_QC = ['passed', 'Passed', 'PASSED', 'approved', 'APPROVED', 'pass', 'PASS'];
const FAILED_QC = ['failed', 'FAILED', 'rejected', 'REJECTED', 'fail', 'FAIL'];

function norm(s) {
  return String(s || '').toLowerCase();
}

function isPoCompleted(status) {
  const s = norm(status);
  return ['fulfilled', 'completed', 'received', 'closed', 'delivered'].includes(s);
}

function isPoPending(status) {
  const s = norm(status);
  return ['draft', 'pending', 'pending_approval', 'approved', 'sent', 'acknowledged', 'partially_received', 'on_hold'].includes(s);
}

function isPoCancelled(status) {
  const s = norm(status);
  return ['cancelled', 'canceled', 'rejected'].includes(s);
}

async function getPerformance(vendorId) {
  const base = { vendorId };

  const totalGRNs = await GRN.countDocuments(mergeHubFilter(base));
  const approvedGRNs = await GRN.countDocuments(
    mergeHubFilter({ ...base, status: { $in: ['APPROVED', 'approved', 'Approved'] } })
  );
  const rejectedGRNs = await GRN.countDocuments(
    mergeHubFilter({ ...base, status: { $in: ['REJECTED', 'rejected', 'Rejected'] } })
  );

  const qcTotal = await QCCheck.countDocuments(mergeHubFilter(base));
  const qcPassed = await QCCheck.countDocuments(mergeHubFilter({ ...base, status: { $in: PASSED_QC } }));
  const qcFailed = await QCCheck.countDocuments(mergeHubFilter({ ...base, status: { $in: FAILED_QC } }));
  const qcPending = Math.max(0, qcTotal - qcPassed - qcFailed);

  const complaints = await Alert.countDocuments(mergeHubFilter({ ...base, type: 'COMPLAINT' }));

  const pos = await PurchaseOrder.find(mergeHubFilter({ ...base, archived: { $ne: true } }))
    .select('status totals expectedDeliveryDate createdAt')
    .lean();

  let totalOrders = pos.length;
  let completedOrders = 0;
  let pendingOrders = 0;
  let cancelledOrders = 0;
  let totalRevenue = 0;

  for (const po of pos) {
    const st = po.status;
    if (isPoCancelled(st)) cancelledOrders += 1;
    else if (isPoCompleted(st)) completedOrders += 1;
    else if (isPoPending(st)) pendingOrders += 1;
    else pendingOrders += 1;

    const gt = po.totals?.grandTotal;
    if (typeof gt === 'number' && !Number.isNaN(gt)) totalRevenue += gt;
  }

  const grnSlaPct =
    totalGRNs === 0 ? null : Math.round((approvedGRNs / totalGRNs) * 1000) / 10;
  const qcQualityPct =
    qcTotal === 0 ? null : Math.round((qcPassed / qcTotal) * 1000) / 10;
  const orderFulfillmentPct =
    totalOrders === 0 ? null : Math.round((completedOrders / totalOrders) * 1000) / 10;

  const parts = [grnSlaPct, qcQualityPct, orderFulfillmentPct].filter((x) => x != null);
  const overallScore =
    parts.length === 0
      ? 0
      : Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;

  return {
    vendorId,
    purchaseOrders: {
      total: totalOrders,
      completed: completedOrders,
      pending: pendingOrders,
      cancelled: cancelledOrders,
    },
    qc: {
      total: qcTotal,
      passed: qcPassed,
      failed: qcFailed,
      pending: qcPending,
    },
    grn: {
      total: totalGRNs,
      approved: approvedGRNs,
      rejected: rejectedGRNs,
    },
    complaintsLast30d: complaints,
    deliveryTimelinessPct: grnSlaPct ?? 0,
    productQualityPct: qcQualityPct ?? 0,
    orderFulfillmentPct: orderFulfillmentPct ?? 0,
    compliancePct: qcQualityPct ?? 0,
    overallScore,
    totalRevenue,
    currencyCode: 'INR',
    timeseries: [],
  };
}

async function getHealth(vendorId) {
  const openAlerts = await Alert.countDocuments(mergeHubFilter({ vendorId, status: 'open' }));
  const recentHealthCheck = new Date();
  return {
    vendorId,
    overallStatus: openAlerts > 5 ? 'degraded' : openAlerts > 0 ? 'degraded' : 'healthy',
    lastHealthCheck: recentHealthCheck,
    openAlertsCount: openAlerts,
    recentAlerts: await Alert.find(mergeHubFilter({ vendorId })).sort({ createdAt: -1 }).limit(5).lean(),
  };
}

module.exports = { getPerformance, getHealth };
