const GRN = require('../models/GRN');
const Shipment = require('../models/Shipment');
const Exception = require('../models/Exception');
const { v4: uuidv4 } = require('uuid');
const Job = require('../models/Job');

async function createGRN(payload) {
  const grn = new GRN(payload);
  await grn.save();
  return grn.toObject();
}

async function getGRNById(grnId) {
  const grn = await GRN.findById(grnId).lean();
  if (!grn) {
    const err = new Error('GRN not found');
    err.status = 404;
    throw err;
  }
  return grn;
}

async function updateGRN(grnId, payload) {
  const grn = await GRN.findById(grnId);
  if (!grn) {
    const err = new Error('GRN not found');
    err.status = 404;
    throw err;
  }
  Object.assign(grn, payload);
  await grn.save();
  return grn.toObject();
}

async function changeGRNStatus(grnId, payload) {
  const grn = await GRN.findById(grnId);
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
    // store rejection reason on the GRN for audit
    grn.rejectionReason = payload.reason;
  }
  await grn.save();
  return grn.toObject();
}

async function approveGRN(grnId) {
  return changeGRNStatus(grnId, { status: 'APPROVED' });
}

async function rejectGRN(grnId, reason) {
  // Ensure reason is forwarded to status change validation and stored on the GRN
  const grn = await changeGRNStatus(grnId, { status: 'REJECTED', reason });
  // create exception
  const exception = new Exception({ grnId, description: reason, type: 'REJECTED', status: 'OPEN' });
  await exception.save();
  return { grn, exception: exception.toObject() };
}

async function listGRNs(query) {
  const page = Math.max(1, parseInt(query.page || 1));
  const limit = Math.max(1, parseInt(query.limit || 25));
  const filter = {};
  if (query.vendorId) filter.vendorId = query.vendorId;
  if (query.status) filter.status = query.status;
  const total = await GRN.countDocuments(filter);
  const data = await GRN.find(filter).skip((page - 1) * limit).limit(limit).lean();
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function createShipment(payload) {
  const s = new Shipment(payload);
  await s.save();
  return s.toObject();
}

async function updateShipmentStatus(shipmentId, payload) {
  const s = await Shipment.findById(shipmentId);
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
  const data = await Exception.find(filter).lean();
  return { data, pagination: { page: 1, limit: data.length, total: data.length, pages: 1 } };
}

async function createException(payload) {
  const ex = new Exception(payload);
  await ex.save();
  return ex.toObject();
}

async function resolveException(exceptionId, payload) {
  const ex = await Exception.findById(exceptionId);
  if (!ex) {
    const err = new Error('Exception not found');
    err.status = 404;
    throw err;
  }
  ex.status = 'RESOLVED';
  ex.resolvedAt = new Date();
  await ex.save();
  return ex.toObject();
}

async function createImportJob() {
  // use lowercase enum values to match Job schema enum
  const job = new Job({ jobId: uuidv4(), type: 'inbound-import', status: 'pending' });
  await job.save();
  return job.toObject();
}

module.exports = {
  createGRN,
  getGRNById,
  updateGRN,
  changeGRNStatus,
  approveGRN,
  rejectGRN,
  listGRNs,
  createShipment,
  updateShipmentStatus,
  listExceptions,
  createException,
  resolveException,
  createImportJob,
};

