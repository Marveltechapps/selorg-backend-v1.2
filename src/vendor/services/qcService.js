const QCCheck = require('../models/QCCheck');

async function listQCChecks(query) {
  const page = Math.max(1, parseInt(query.page || 1));
  const perPage = Math.max(1, parseInt(query.perPage || 25));
  const filter = {};
  if (query.vendorId) filter.vendorId = query.vendorId;
  if (query.status && query.status !== 'all') filter.status = query.status;
  const total = await QCCheck.countDocuments(filter);
  const data = await QCCheck.find(filter).skip((page - 1) * perPage).limit(perPage).lean();
  return { pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) }, data };
}

async function createQCCheck(payload) {
  const check = new QCCheck(payload);
  await check.save();
  return check.toObject();
}

async function getQCCheckById(id) {
  const c = await QCCheck.findById(id).lean();
  if (!c) {
    const err = new Error('QC check not found');
    err.status = 404;
    throw err;
  }
  return c;
}

async function updateQCCheck(id, payload) {
  const c = await QCCheck.findById(id);
  if (!c) {
    const err = new Error('QC check not found');
    err.status = 404;
    throw err;
  }
  Object.assign(c, payload);
  await c.save();
  return c.toObject();
}

module.exports = { listQCChecks, createQCCheck, getQCCheckById, updateQCCheck };

