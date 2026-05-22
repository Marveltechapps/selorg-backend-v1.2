const QCCheck = require('../models/QCCheck');
const { mergeHubFilter, hubFieldsForCreate } = require('../constants/hubScope');


const Vendor = require('../models/Vendor');

const PASSED = ['approved', 'passed', 'pass', 'APPROVED', 'PASSED', 'PASS'];
const FAILED = ['rejected', 'failed', 'fail', 'REJECTED', 'FAILED', 'FAIL'];

function normStatus(s) {
  return String(s || 'pending').toLowerCase();
}

function mapStatusToResult(status) {
  const s = normStatus(status);
  if (PASSED.includes(s) || s === 'approved') return 'Pass';
  if (FAILED.includes(s) || s === 'rejected') return 'Fail';
  return 'Pending';
}

function inferCheckType(row) {
  if (row.checkType) return row.checkType;
  const notes = String(row.notes || '').toLowerCase();
  if (notes.includes('temperature')) return 'Temperature';
  if (notes.includes('packaging')) return 'Packaging';
  if (notes.includes('label')) return 'Labeling';
  return 'Visual';
}

async function enrichQCChecks(rows) {
  if (!rows.length) return [];
  const vendorIds = [...new Set(rows.map((r) => String(r.vendorId)).filter(Boolean))];
  const vendors = await Vendor.find(mergeHubFilter({ _id: { $in: vendorIds } }))
    .select('name vendorName')
    .lean();
  const vendorNameById = Object.fromEntries(
    vendors.map((v) => [String(v._id), v.vendorName || v.name || String(v._id)])
  );

  return rows.map((row) => {
    const status = normStatus(row.status);
    const result = row.result || mapStatusToResult(status);
    return {
      ...row,
      id: String(row._id),
      vendor: vendorNameById[row.vendorId] || row.vendorName || row.vendorId,
      vendorName: vendorNameById[row.vendorId] || row.vendorName,
      product: row.productName || row.product || row.batchId || 'Product',
      productName: row.productName || row.product || row.batchId,
      checkType: inferCheckType(row),
      result,
      inspector: row.inspectorName || row.inspectorId || 'QC Inspector',
      date: row.createdAt,
      createdAt: row.createdAt,
    };
  });
}

async function getOverview() {
  const scoped = mergeHubFilter({});
  const all = await QCCheck.find(scoped).lean();
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const today = all.filter((c) => new Date(c.createdAt) >= startToday);
  const last7 = all.filter((c) => new Date(c.createdAt) >= sevenDaysAgo);

  const countPassFail = (arr) => {
    let passed = 0;
    let failed = 0;
    let pending = 0;
    for (const c of arr) {
      const r = mapStatusToResult(c.status);
      if (r === 'Pass') passed += 1;
      else if (r === 'Fail') failed += 1;
      else pending += 1;
    }
    return { passed, failed, pending, total: arr.length };
  };

  const t = countPassFail(today);
  const w = countPassFail(last7);
  const passRate7d = w.total ? Math.round((w.passed / w.total) * 1000) / 10 : 0;

  const failedChecks = all.filter((c) => mapStatusToResult(c.status) === 'Fail');
  const criticalFailures = failedChecks.filter((c) =>
    String(c.notes || '').toLowerCase().includes('temperature')
  ).length;

  return {
    batchesCheckedToday: t.total,
    passedToday: t.passed,
    failedToday: t.failed,
    pendingToday: t.pending,
    passRateToday: t.total ? Math.round((t.passed / t.total) * 1000) / 10 : 0,
    last7Days: {
      total: w.total,
      passed: w.passed,
      failed: w.failed,
      passRate: passRate7d,
    },
    failuresRequiringAction: failedChecks.length,
    criticalFailures,
    majorFailures: Math.max(0, failedChecks.length - criticalFailures),
  };
}


async function listQCChecks(query) {
  const page = Math.max(1, parseInt(query.page || 1));
  const perPage = Math.max(1, parseInt(query.perPage || 25));
  const filter = {};
  if (query.vendorId) filter.vendorId = query.vendorId;
  if (query.status && query.status !== 'all') filter.status = query.status;
  const scoped = mergeHubFilter(filter);
  const total = await QCCheck.countDocuments(scoped);
  const rows = await QCCheck.find(scoped).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean();
  const data = await enrichQCChecks(rows);
  return { pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) }, data };
}

async function createQCCheck(payload) {
  const check = new QCCheck({ ...payload, ...hubFieldsForCreate() });
  await check.save();
  return check.toObject();
}

async function getQCCheckById(id) {
  const c = await QCCheck.findOne(mergeHubFilter({ _id: id })).lean();
  if (!c) {
    const err = new Error('QC check not found');
    err.status = 404;
    throw err;
  }
  return c;
}

async function deleteQCCheck(id) {
  const c = await QCCheck.findOneAndDelete(mergeHubFilter({ _id: id }));
  if (!c) {
    const err = new Error('QC check not found');
    err.status = 404;
    throw err;
  }
  return { deleted: true, id: String(c._id) };
}

async function updateQCCheck(id, payload) {
  const c = await QCCheck.findOne(mergeHubFilter({ _id: id }));
  if (!c) {
    const err = new Error('QC check not found');
    err.status = 404;
    throw err;
  }
  if (payload.status) {
    payload.result = mapStatusToResult(payload.status);
  }
  Object.assign(c, payload);
  await c.save();
  return c.toObject();
}

module.exports = { listQCChecks, createQCCheck, getQCCheckById, updateQCCheck, deleteQCCheck, getOverview, enrichQCChecks };

