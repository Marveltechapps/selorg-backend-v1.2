const PurchaseOrder = require('../models/PurchaseOrder');
const Job = require('../models/Job');
const { v4: uuidv4 } = require('uuid');
const vendorWarehouseIntegrationService = require('../../shared/services/vendorWarehouseIntegrationService');
const logger = require('../../core/utils/logger');

async function createPurchaseOrder(payload, requester) {
  // validate totals vs items (basic)
  const po = new PurchaseOrder({
    vendorId: payload.vendorId,
    reference: payload.reference,
    currency: payload.currency || 'INR',
    expectedDeliveryDate: payload.expectedDeliveryDate,
    items: payload.items || [],
    notes: payload.notes,
    status: payload.initialStatus || 'draft',
    createdBy: requester || null,
  });
  // compute totals
  const subTotal = (po.items || []).reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
  po.totals = {
    subTotal,
    taxTotal: 0,
    shipping: 0,
    grandTotal: subTotal,
  };
  await po.save();
  return po.toObject();
}

async function listPurchaseOrders(query) {
  const page = Math.max(1, parseInt(query.page || 1));
  const perPage = Math.max(1, parseInt(query.perPage || 25));
  const filter = {};
  if (query.vendorId) filter.vendorId = query.vendorId;
  if (query.status && query.status !== 'all') filter.status = query.status;
  const total = await PurchaseOrder.countDocuments(filter);
  const data = await PurchaseOrder.find(filter)
    .skip((page - 1) * perPage)
    .limit(perPage)
    .sort({ createdAt: -1 })
    .lean();
  return { pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) }, data };
}

async function getPurchaseOrderById(poId) {
  const po = await PurchaseOrder.findById(poId).lean();
  if (!po) {
    const err = new Error('Purchase order not found');
    err.status = 404;
    throw err;
  }
  return po;
}

async function updatePurchaseOrder(poId, payload) {
  const po = await PurchaseOrder.findById(poId);
  if (!po) {
    const err = new Error('Purchase order not found');
    err.status = 404;
    throw err;
  }
  if (['sent', 'fully_received', 'cancelled'].includes(po.status)) {
    const err = new Error('Invalid state for full update');
    err.status = 409;
    throw err;
  }
  Object.assign(po, payload);
  await po.save();
  return po.toObject();
}

async function performAction(poId, actionRequest) {
  const po = await PurchaseOrder.findById(poId);
  if (!po) {
    const err = new Error('Purchase order not found');
    err.status = 404;
    throw err;
  }
  const { action } = actionRequest;
  // basic transitions
  if (action === 'approve') po.status = 'approved';
  else if (action === 'send') po.status = 'sent';
  else if (action === 'cancel') po.status = 'cancelled';
  else if (action === 'hold') po.status = 'on_hold';
  else if (action === 'reactivate') po.status = 'pending_approval';
  else if (action === 'receive' || action === 'partial_receive') {
    po.status = action === 'receive' ? 'fully_received' : 'partially_received';
    if (actionRequest.quantityReceived) {
      // simple update: reduce quantities
    }
    // Trigger Warehouse GRN creation (links vendor receipt to warehouse inbound)
    try {
      const poObj = po.toObject ? po.toObject() : po;
      await vendorWarehouseIntegrationService.createWarehouseGRNFromVendorPO(poObj);
    } catch (intErr) {
      // Log but don't fail the PO action - GRN creation is best-effort
      logger.warn('Vendor→Warehouse GRN creation failed (non-blocking)', { poId, error: intErr.message });
    }
  } else {
    const err = new Error('Invalid action');
    err.status = 400;
    throw err;
  }
  await po.save();
  return po.toObject();
}

async function createBulkUploadJob(meta) {
  const job = new Job({ jobId: uuidv4(), type: 'bulk-upload-po', status: 'pending', result: meta });
  await job.save();
  return job.toObject();
}

module.exports = {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  performAction,
  createBulkUploadJob,
};

