const Vendor = require('../models/Vendor');
const Job = require('../models/Job');
const { v4: uuidv4 } = require('uuid');

async function createVendor(payload) {
  // check duplicate by code or contact email
  if (payload.code) {
    const existing = await Vendor.findOne({ code: payload.code });
    if (existing) {
      const err = new Error(`Vendor code '${payload.code}' already exists`);
      err.status = 409;
      throw err;
    }
  }
  const vendor = new Vendor({
    name: payload.name,
    code: payload.code,
    contact: payload.contact,
    address: payload.address,
    onboarding: payload.onboarding,
    metadata: payload.metadata,
    status: payload.status || 'pending',
  });
  await vendor.save();
  return vendor.toObject();
}

async function listVendors(query) {
  const page = Math.max(1, parseInt(query.page || 1));
  const limit = Math.max(1, parseInt(query.limit || 25));
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { 'contact.email': { $regex: query.search, $options: 'i' } },
    ];
  }
  const total = await Vendor.countDocuments(filter);
  const data = await Vendor.find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();
  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data,
  };
}

async function getVendorById(vendorId) {
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.status = 404;
    throw err;
  }
  return vendor;
}

async function updateVendor(vendorId, payload) {
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.status = 404;
    throw err;
  }
  Object.assign(vendor, payload);
  await vendor.save();
  return vendor.toObject();
}

async function patchVendor(vendorId, payload) {
  return updateVendor(vendorId, payload);
}

async function performAction(vendorId, actionRequest) {
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.status = 404;
    throw err;
  }
  const previousStatus = vendor.status;
  const { action } = actionRequest;
  // simple transitions
  if (action === 'approve') vendor.status = 'active';
  else if (action === 'reject') vendor.status = 'rejected';
  else if (action === 'reactivate') vendor.status = 'active';
  else if (action === 'archive') vendor.status = 'archived';
  else {
    const err = new Error('Unknown action');
    err.status = 400;
    throw err;
  }
  await vendor.save();
  return {
    vendorId,
    action,
    previousStatus,
    newStatus: vendor.status,
    message: `Action ${action} applied`,
  };
}

async function createJobForVendor(type, meta) {
  const job = new Job({
    jobId: uuidv4(),
    type,
    status: 'pending',
    result: meta || null,
  });
  await job.save();
  return job.toObject();
}

module.exports = {
  createVendor,
  listVendors,
  getVendorById,
  updateVendor,
  patchVendor,
  performAction,
  createJobForVendor,
};

