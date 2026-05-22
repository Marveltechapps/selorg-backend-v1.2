const GRN = require('../models/GRN');
const Shipment = require('../models/Shipment');
const Exception = require('../models/Exception');
const RTV = require('../models/RTV');
const Vendor = require('../models/Vendor');
const { v4: uuidv4 } = require('uuid');
const Job = require('../models/Job');
const { mergeHubFilter, hubFieldsForCreate } = require('../constants/hubScope');

const DEFAULT_TRACKING_STEPS = [
  'Pickup Scheduled',
  'Picked Up',
  'At Hub',
  'Out for Delivery',
  'Delivered',
];

function mapExceptionTypeToUi(type) {
  const t = String(type || '').toUpperCase();
  if (t.includes('SHORT')) return 'Short';
  if (t.includes('EXCESS')) return 'Excess';
  if (t.includes('DAMAGE') || t.includes('REJECT')) return 'Damaged';
  if (t.includes('MISS')) return 'Missing';
  if (t.includes('QUALITY')) return 'Quality';
  return 'No Issue';
}

function mapItemsToLineItems(items) {
  return (items || []).map((it) => {
    const ordered = Number(it.quantity ?? 0);
    const received = Number(it.receivedQuantity ?? 0);
    let status = 'Complete';
    if (received < ordered) status = 'Short';
    else if (received > ordered) status = 'Excess';
    return {
      sku: it.sku || '',
      product: it.sku || 'Item',
      ordered,
      received,
      unit: it.unit || 'units',
      status,
    };
  });
}

function mapLegacyGrnStatus(status) {
  const s = String(status || 'PENDING').toLowerCase();
  if (s === 'approved' || s === 'completed') return 'APPROVED';
  if (s === 'rejected') return 'REJECTED';
  if (s === 'in_progress' || s === 'partial') return 'PARTIAL';
  if (s === 'archived') return 'ARCHIVED';
  return 'PENDING';
}

function buildLineItemsFromLegacy(grn) {
  if (Array.isArray(grn.items) && grn.items.length) return mapItemsToLineItems(grn.items);
  const qty = Number(grn.total_quantity ?? grn.received_quantity ?? 0);
  const count = Number(grn.items_count ?? 1);
  const perItem = count > 0 ? Math.floor(qty / count) : qty;
  return [
    {
      sku: 'MIXED-SKU',
      product: grn.supplier ? `${grn.supplier} shipment` : 'Inbound items',
      ordered: qty || perItem,
      received: Number(grn.received_quantity ?? 0),
      unit: 'units',
      status: 'Complete',
    },
  ];
}

async function enrichGrn(grn) {
  const doc = { ...grn, id: String(grn._id) };
  doc.grnNumber =
    grn.grnNumber ||
    grn.grn_id ||
    `GRN-${String(grn._id).slice(-8).toUpperCase()}`;
  doc.shipmentId = grn.shipmentId || grn.truck_id || grn.poNumber || '—';
  doc.warehouse = grn.warehouse || grn.store_id || 'Hub';
  doc.status = mapLegacyGrnStatus(grn.status);

  if (grn.vendorId) {
    const vendor = await Vendor.findOne(mergeHubFilter({ _id: grn.vendorId })).select('name').lean();
    doc.vendor = vendor?.name || grn.vendorName || grn.vendorId;
  } else {
    doc.vendor = grn.vendor || grn.supplier || grn.vendorName || '—';
  }

  const openEx = await Exception.findOne(
    mergeHubFilter({ grnId: String(grn._id), status: 'OPEN' })
  )
    .sort({ createdAt: -1 })
    .lean();

  if (openEx) {
    doc.exceptionType = mapExceptionTypeToUi(openEx.type);
    doc.exceptionDetails = openEx.description;
  } else {
    doc.exceptionType = grn.exceptionType || 'No Issue';
    doc.exceptionDetails = grn.exceptionDetails;
  }

  doc.lineItems = buildLineItemsFromLegacy(grn);
  doc.date = grn.receivedAt
    ? new Date(grn.receivedAt).toLocaleDateString()
    : grn.createdAt
      ? new Date(grn.createdAt).toLocaleDateString()
      : new Date().toLocaleDateString();

  return doc;
}

async function createGRN(payload) {
  const grn = new GRN({
    ...payload,
    grnNumber: payload.grnNumber || `GRN-${Date.now()}`,
    ...hubFieldsForCreate(),
  });
  await grn.save();
  return enrichGrn(grn.toObject());
}

async function getGRNById(grnId) {
  const grn = await GRN.findOne(mergeHubFilter({ _id: grnId })).lean();
  if (!grn) {
    const err = new Error('GRN not found');
    err.status = 404;
    throw err;
  }
  return enrichGrn(grn);
}

async function updateGRN(grnId, payload) {
  const grn = await GRN.findOne(mergeHubFilter({ _id: grnId }));
  if (!grn) {
    const err = new Error('GRN not found');
    err.status = 404;
    throw err;
  }

  if (payload.items && Array.isArray(payload.items)) {
    const bySku = new Map();
    for (const item of grn.items || []) {
      bySku.set(item.sku, item.toObject ? item.toObject() : { ...item });
    }
    for (const patch of payload.items) {
      if (!patch.sku) continue;
      const existing = bySku.get(patch.sku) || { sku: patch.sku };
      if (patch.receivedQuantity != null) existing.receivedQuantity = patch.receivedQuantity;
      if (patch.received_quantity != null) existing.receivedQuantity = patch.received_quantity;
      if (patch.quantity != null) existing.quantity = patch.quantity;
      if (patch.remarks != null) existing.remarks = patch.remarks;
      if (patch.notes != null) existing.remarks = patch.notes;
      bySku.set(patch.sku, existing);
    }
    grn.items = Array.from(bySku.values());
    delete payload.items;
  }

  if (payload.notes) {
    grn.notes = grn.notes ? `${grn.notes} | ${payload.notes}` : payload.notes;
    delete payload.notes;
  }

  Object.assign(grn, payload);
  await grn.save();
  return enrichGrn(grn.toObject());
}

async function changeGRNStatus(grnId, payload) {
  const grn = await GRN.findOne(mergeHubFilter({ _id: grnId }));
  if (!grn) {
    const err = new Error('GRN not found');
    err.status = 404;
    throw err;
  }
  if (payload.status === 'REJECTED' && !payload.reason) {
    const err = new Error('Reason required for rejection');
    err.status = 400;
    throw err;
  }
  grn.status = payload.status || grn.status;
  if (payload.status === 'REJECTED' && payload.reason) {
    grn.rejectionReason = payload.reason;
    grn.exceptionType = 'Damaged';
  }
  if (payload.notes) grn.notes = payload.notes;
  if (payload.qualityChecked != null) grn.qualityChecked = payload.qualityChecked;
  if (payload.documentsComplete != null) grn.documentsComplete = payload.documentsComplete;
  await grn.save();
  return enrichGrn(grn.toObject());
}

async function approveGRN(grnId, meta = {}) {
  return changeGRNStatus(grnId, { status: 'APPROVED', ...meta });
}

async function rejectGRN(grnId, reason) {
  const grn = await changeGRNStatus(grnId, { status: 'REJECTED', reason });
  const exception = new Exception({
    ...hubFieldsForCreate(),
    grnId: String(grn.id),
    grnReference: grn.grnNumber,
    description: reason,
    type: 'REJECTED',
    status: 'OPEN',
  });
  await exception.save();
  return { grn, exception: exception.toObject() };
}

async function archiveGRN(grnId) {
  return changeGRNStatus(grnId, { status: 'ARCHIVED' });
}

async function listGRNs(query) {
  const page = Math.max(1, parseInt(query.page || 1, 10));
  const limit = Math.max(1, parseInt(query.limit || 25, 10));
  const filter = {};
  if (query.vendorId) filter.vendorId = query.vendorId;
  if (query.status) {
    const s = String(query.status).toUpperCase();
    filter.status = s;
  } else if (query.includeArchived !== 'true') {
    filter.status = { $ne: 'ARCHIVED' };
  }
  const scoped = mergeHubFilter(filter);
  const total = await GRN.countDocuments(scoped);
  const rows = await GRN.find(scoped)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const data = await Promise.all(rows.map(enrichGrn));
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function createShipment(payload) {
  const s = new Shipment({ ...payload, ...hubFieldsForCreate() });
  await s.save();
  return s.toObject();
}

async function updateShipmentStatus(shipmentId, payload) {
  const s = await Shipment.findOne(mergeHubFilter({ _id: shipmentId }));
  if (!s) {
    const err = new Error('Shipment not found');
    err.status = 404;
    throw err;
  }
  Object.assign(s, payload);
  await s.save();
  return s.toObject();
}

async function listExceptions(query) {
  const filter = {};
  if (query.grnId) filter.grnId = query.grnId;
  if (query.status) filter.status = query.status;
  const rows = await Exception.find(mergeHubFilter(filter)).sort({ createdAt: -1 }).lean();
  const data = rows.map((ex) => ({
    ...ex,
    id: String(ex._id),
    grnReference: ex.grnReference || ex.grnId,
    exceptionType: mapExceptionTypeToUi(ex.type),
  }));
  return { data, pagination: { page: 1, limit: data.length, total: data.length, pages: 1 } };
}

async function createException(payload) {
  const ex = new Exception({
    ...payload,
    grnReference: payload.grnReference || payload.grnId,
    ...hubFieldsForCreate(),
  });
  await ex.save();

  if (payload.grnId) {
    const grn = await GRN.findOne(mergeHubFilter({ _id: payload.grnId }));
    if (grn) {
      grn.exceptionType = mapExceptionTypeToUi(payload.type);
      await grn.save();
    }
  }

  return { ...ex.toObject(), id: String(ex._id) };
}

async function resolveException(exceptionId) {
  const ex = await Exception.findOne(mergeHubFilter({ _id: exceptionId }));
  if (!ex) {
    const err = new Error('Exception not found');
    err.status = 404;
    throw err;
  }
  ex.status = 'RESOLVED';
  ex.resolvedAt = new Date();
  await ex.save();

  const openCount = await Exception.countDocuments(
    mergeHubFilter({ grnId: ex.grnId, status: 'OPEN' })
  );
  if (openCount === 0) {
    await GRN.updateOne(mergeHubFilter({ _id: ex.grnId }), { exceptionType: 'No Issue' });
  }

  return { ...ex.toObject(), id: String(ex._id) };
}

async function listRTVs() {
  const rows = await RTV.find(mergeHubFilter({})).sort({ createdAt: -1 }).lean();
  const data = rows.map((r) => ({
    ...r,
    id: String(r._id),
    trackingSteps: r.trackingSteps?.length ? r.trackingSteps : DEFAULT_TRACKING_STEPS,
  }));
  return { data, pagination: { page: 1, limit: data.length, total: data.length, pages: 1 } };
}

async function createRTV(payload) {
  const existing = await RTV.findOne(
    mergeHubFilter({ grnId: payload.grnId, status: { $ne: 'REJECTED' } })
  );
  if (existing) {
    const err = new Error('RTV already exists for this GRN');
    err.status = 409;
    throw err;
  }
  const rtv = new RTV({
    ...payload,
    rtvNumber: payload.rtvNumber || `RTV-${Date.now()}`,
    status: 'OPEN',
    trackingSteps: DEFAULT_TRACKING_STEPS,
    currentTrackingStep: 0,
    ...hubFieldsForCreate(),
  });
  await rtv.save();
  return { ...rtv.toObject(), id: String(rtv._id) };
}

async function updateRTVStatus(rtvId, payload) {
  const rtv = await RTV.findOne(mergeHubFilter({ _id: rtvId }));
  if (!rtv) {
    const err = new Error('RTV not found');
    err.status = 404;
    throw err;
  }
  if (payload.status) rtv.status = payload.status;
  if (payload.currentTrackingStep != null) rtv.currentTrackingStep = payload.currentTrackingStep;
  if (!rtv.trackingSteps?.length) rtv.trackingSteps = DEFAULT_TRACKING_STEPS;
  await rtv.save();
  return { ...rtv.toObject(), id: String(rtv._id) };
}

async function createImportJob() {
  const job = new Job({
    ...hubFieldsForCreate(),
    jobId: uuidv4(),
    type: 'inbound-import',
    status: 'pending',
  });
  await job.save();
  return job.toObject();
}

async function getImportJobStatus(jobId) {
  const job = await Job.findOne(mergeHubFilter({ jobId })).lean();
  if (!job) {
    const err = new Error('Import job not found');
    err.status = 404;
    throw err;
  }
  return {
    id: job.jobId,
    status: String(job.status || 'pending').toUpperCase(),
    progress: job.progress ?? 0,
  };
}

async function exportGrnReport() {
  const rows = await GRN.find(mergeHubFilter({ status: { $ne: 'ARCHIVED' } }))
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  const enriched = await Promise.all(rows.map(enrichGrn));
  const header = 'grnNumber,vendor,status,shipmentId,date,exceptionType\n';
  const lines = enriched.map(
    (g) =>
      `"${g.grnNumber}","${g.vendor}","${g.status}","${g.shipmentId}","${g.date}","${g.exceptionType}"`
  );
  return header + lines.join('\n');
}

module.exports = {
  createGRN,
  getGRNById,
  updateGRN,
  changeGRNStatus,
  approveGRN,
  rejectGRN,
  archiveGRN,
  listGRNs,
  createShipment,
  updateShipmentStatus,
  listExceptions,
  createException,
  resolveException,
  listRTVs,
  createRTV,
  updateRTVStatus,
  createImportJob,
  getImportJobStatus,
  exportGrnReport,
  enrichGrn,
};
