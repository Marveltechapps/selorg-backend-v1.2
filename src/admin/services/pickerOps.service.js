const PickerUser = require('../../picker/models/user.model');
const Attendance = require('../../picker/models/attendance.model');
const PickerAgency = require('../models/PickerAgency');
const PickerShiftSlot = require('../models/PickerShiftSlot');
const PickerOtRequest = require('../models/PickerOtRequest');
const PickerShiftChangeRequest = require('../models/PickerShiftChangeRequest');
const Store = require('../../merch/models/Store');

function mapPickerOpsStatus(pickerStatus) {
  // PickerUser.status enum: PENDING|ACTIVE|REJECTED|BLOCKED|SUSPENDED
  if (pickerStatus === 'PENDING') return 'pending';
  if (pickerStatus === 'ACTIVE') return 'approved';
  if (pickerStatus === 'REJECTED') return 'rejected';
  return 'deactivated';
}

async function listPickers({ q, status, page = 1, limit = 50 }) {
  const query = {};
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: rx }, { phone: rx }];
  }
  if (status && status !== 'all') {
    if (status === 'deactivated') {
      query.status = { $in: ['BLOCKED', 'SUSPENDED'] };
    } else {
      const target =
        status === 'pending'
          ? 'PENDING'
          : status === 'approved'
            ? 'ACTIVE'
            : status === 'rejected'
              ? 'REJECTED'
              : 'BLOCKED';
      query.status = target;
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const [rows, total] = await Promise.all([
    PickerUser.find(query)
      .select('_id name phone status agencyId storeId shiftSlotId')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    PickerUser.countDocuments(query),
  ]);

  const agencyIds = [...new Set(rows.map((r) => String(r.agencyId || '')).filter(Boolean))];
  const storeIds = [...new Set(rows.map((r) => String(r.storeId || '')).filter(Boolean))];
  const slotIds = [...new Set(rows.map((r) => String(r.shiftSlotId || '')).filter(Boolean))];

  const [agencies, stores, slots] = await Promise.all([
    agencyIds.length ? PickerAgency.find({ _id: { $in: agencyIds } }).select('_id name').lean() : [],
    storeIds.length ? Store.find({ _id: { $in: storeIds } }).select('_id name code').lean() : [],
    slotIds.length ? PickerShiftSlot.find({ _id: { $in: slotIds } }).select('_id type startTime endTime').lean() : [],
  ]);

  const agencyById = Object.fromEntries(agencies.map((a) => [String(a._id), a]));
  const storeById = Object.fromEntries(stores.map((s) => [String(s._id), s]));
  const slotById = Object.fromEntries(slots.map((s) => [String(s._id), s]));

  return {
    data: rows.map((p) => {
      const agency = p.agencyId ? agencyById[String(p.agencyId)] : null;
      const store = p.storeId ? storeById[String(p.storeId)] : null;
      const slot = p.shiftSlotId ? slotById[String(p.shiftSlotId)] : null;
      const shiftSlotLabel = slot ? `${String(slot.type).toUpperCase()} • ${slot.startTime} - ${slot.endTime}` : null;
      return {
        pickerId: String(p._id),
        name: p.name || '',
        phone: p.phone || '',
        agencyId: p.agencyId ? String(p.agencyId) : null,
        agencyName: agency?.name || null,
        storeId: p.storeId ? String(p.storeId) : null,
        storeName: store ? `${store.name}` : null,
        shiftSlotId: p.shiftSlotId ? String(p.shiftSlotId) : null,
        shiftSlotLabel,
        status: mapPickerOpsStatus(p.status),
      };
    }),
    total,
    page: pageNum,
    pageSize: limitNum,
  };
}

async function updatePickerAssignment(pickerId, { agencyId, storeId, shiftSlotId }) {
  const update = {
    agencyId: agencyId || null,
    storeId: storeId || null,
    shiftSlotId: shiftSlotId || null,
  };
  const picker = await PickerUser.findByIdAndUpdate(pickerId, { $set: update }, { new: true }).lean();
  if (!picker) throw new Error('Picker not found');
  return picker;
}

async function updatePickerOpsStatus(pickerId, { status, reason }, approvedBy, req) {
  if (!status) throw new Error('status is required');
  const mapped =
    status === 'pending'
      ? 'PENDING'
      : status === 'approved'
        ? 'ACTIVE'
        : status === 'rejected'
          ? 'REJECTED'
          : 'BLOCKED';

  // Reuse existing admin workflow where possible
  const pickerApprovalsService = require('./pickerApprovals.service');
  const updated = await pickerApprovalsService.updatePickerStatus(
    pickerId,
    { status: mapped, rejectedReason: status === 'rejected' ? reason : undefined },
    approvedBy,
    req
  );
  if (!updated) throw new Error('Picker not found');
  return updated;
}

async function listAgencies() {
  const agencies = await PickerAgency.find({}).sort({ createdAt: -1 }).lean();
  const ids = agencies.map((a) => a._id);
  const counts = ids.length
    ? await PickerUser.aggregate([
        { $match: { agencyId: { $in: ids }, status: 'ACTIVE' } },
        { $group: { _id: '$agencyId', count: { $sum: 1 } } },
      ])
    : [];
  const countById = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  return agencies.map((a) => ({
    agencyId: String(a._id),
    name: a.name,
    contactPerson: a.contactPerson || null,
    phone: a.phone || null,
    isActive: !!a.isActive,
    activePickersCount: countById[String(a._id)] || 0,
  }));
}

async function createAgency(payload) {
  const name = String(payload?.name || '').trim();
  if (!name) throw new Error('name is required');
  const agency = await PickerAgency.create({
    name,
    contactPerson: String(payload?.contactPerson || '').trim(),
    phone: String(payload?.phone || '').trim(),
    isActive: true,
  });
  return agency;
}

async function deactivateAgency(agencyId) {
  const agency = await PickerAgency.findByIdAndUpdate(agencyId, { $set: { isActive: false } }, { new: true }).lean();
  if (!agency) throw new Error('Agency not found');
  return agency;
}

async function activateAgency(agencyId) {
  const agency = await PickerAgency.findByIdAndUpdate(agencyId, { $set: { isActive: true } }, { new: true }).lean();
  if (!agency) throw new Error('Agency not found');
  return agency;
}

async function listStoreShiftSlots(storeId) {
  const slots = await PickerShiftSlot.find({ storeId, isActive: true }).sort({ createdAt: -1 }).lean();
  return slots.map((s) => ({
    shiftSlotId: String(s._id),
    storeId: String(s.storeId),
    type: s.type,
    startTime: s.startTime,
    endTime: s.endTime,
    geofenceRadiusMeters: s.geofenceRadiusMeters,
    gracePeriodMinutes: s.gracePeriodMinutes,
  }));
}

async function createStoreShiftSlot(storeId, payload) {
  const type = String(payload?.type || '').trim().toLowerCase();
  const startTime = String(payload?.startTime || '').trim();
  const endTime = String(payload?.endTime || '').trim();
  if (!type || !startTime || !endTime) throw new Error('type, startTime, endTime are required');
  const slot = await PickerShiftSlot.create({
    storeId,
    type,
    startTime,
    endTime,
    geofenceRadiusMeters:
      payload?.geofenceRadiusMeters != null ? Number(payload.geofenceRadiusMeters) : undefined,
    gracePeriodMinutes: payload?.gracePeriodMinutes != null ? Number(payload.gracePeriodMinutes) : 10,
    isActive: true,
  });
  return slot;
}

async function listOtRequests() {
  const rows = await PickerOtRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
  const pickerIds = [...new Set(rows.map((r) => String(r.pickerId)))];
  const storeIds = [...new Set(rows.map((r) => String(r.storeId || '')).filter(Boolean))];
  const [pickers, stores] = await Promise.all([
    pickerIds.length ? PickerUser.find({ _id: { $in: pickerIds } }).select('_id name phone').lean() : [],
    storeIds.length ? Store.find({ _id: { $in: storeIds } }).select('_id name code').lean() : [],
  ]);
  const pickerById = Object.fromEntries(pickers.map((p) => [String(p._id), p]));
  const storeById = Object.fromEntries(stores.map((s) => [String(s._id), s]));

  return rows.map((r) => ({
    requestId: String(r._id),
    pickerId: String(r.pickerId),
    pickerName: pickerById[String(r.pickerId)]?.name || '—',
    storeId: r.storeId ? String(r.storeId) : '',
    storeName: r.storeId ? `${storeById[String(r.storeId)]?.name || '—'}` : '—',
    requestedOtMinutes: r.requestedOtMinutes || 0,
    shiftEndTime: r.shiftEndTime ? r.shiftEndTime.toISOString() : '',
  }));
}

async function decideOtRequest(requestId, decision, reason, decidedBy) {
  const update =
    decision === 'approve'
      ? { status: 'approved', decidedAt: new Date(), decidedBy, decisionReason: '' }
      : { status: 'rejected', decidedAt: new Date(), decidedBy, decisionReason: reason || 'Rejected by admin' };
  const row = await PickerOtRequest.findByIdAndUpdate(requestId, { $set: update }, { new: true }).lean();
  if (!row) throw new Error('OT request not found');
  return row;
}

async function listShiftChangeRequests() {
  const rows = await PickerShiftChangeRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
  const pickerIds = [...new Set(rows.map((r) => String(r.pickerId)))];
  const slotIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.currentShiftSlotId, r.requestedShiftSlotId])
        .map((v) => String(v || ''))
        .filter(Boolean)
    ),
  ];
  const [pickers, slots] = await Promise.all([
    pickerIds.length ? PickerUser.find({ _id: { $in: pickerIds } }).select('_id name phone shiftSlotId').lean() : [],
    slotIds.length ? PickerShiftSlot.find({ _id: { $in: slotIds } }).select('_id type startTime endTime').lean() : [],
  ]);
  const pickerById = Object.fromEntries(pickers.map((p) => [String(p._id), p]));
  const slotById = Object.fromEntries(slots.map((s) => [String(s._id), s]));

  const labelForSlot = (slotId) => {
    const slot = slotId ? slotById[String(slotId)] : null;
    if (!slot) return '—';
    return `${String(slot.type).toUpperCase()} • ${slot.startTime} - ${slot.endTime}`;
  };

  return rows.map((r) => ({
    requestId: String(r._id),
    pickerId: String(r.pickerId),
    pickerName: pickerById[String(r.pickerId)]?.name || '—',
    currentShiftLabel: labelForSlot(r.currentShiftSlotId),
    requestedShiftLabel: labelForSlot(r.requestedShiftSlotId),
    reason: r.reason || '',
  }));
}

async function decideShiftChangeRequest(requestId, decision, reason, decidedBy) {
  const update =
    decision === 'approve'
      ? { status: 'approved', decidedAt: new Date(), decidedBy, decisionReason: '' }
      : { status: 'rejected', decidedAt: new Date(), decidedBy, decisionReason: reason || 'Rejected by admin' };
  const row = await PickerShiftChangeRequest.findByIdAndUpdate(requestId, { $set: update }, { new: true }).lean();
  if (!row) throw new Error('Shift change request not found');
  return row;
}

function parseMonthParam(monthStr) {
  // monthStr: "YYYY-MM"
  const m = String(monthStr || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error('month must be YYYY-MM');
  const [yyyy, mm] = m.split('-').map((x) => parseInt(x, 10));
  const start = new Date(yyyy, mm - 1, 1, 0, 0, 0);
  const end = new Date(yyyy, mm, 0, 23, 59, 59);
  return { start, end, month: m };
}

async function getAttendanceByMonth({ month, agencyId }) {
  const { start, end } = parseMonthParam(month);

  const pickerMatch = {};
  if (agencyId) pickerMatch.agencyId = agencyId;

  const pickers = await PickerUser.find(pickerMatch).select('_id name agencyId').lean();
  const pickerIds = pickers.map((p) => p._id);

  const agencyIds = [
    ...new Set(pickers.map((p) => String(p.agencyId || '')).filter(Boolean)),
  ];
  const agencies = agencyIds.length ? await PickerAgency.find({ _id: { $in: agencyIds } }).select('_id name').lean() : [];
  const agencyById = Object.fromEntries(agencies.map((a) => [String(a._id), a.name]));

  const agg = pickerIds.length
    ? await Attendance.aggregate([
        { $match: { userId: { $in: pickerIds }, punchIn: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: '$userId',
            daysWorked: { $sum: 1 },
            regularHours: { $sum: { $ifNull: ['$regularHours', 0] } },
            otHours: { $sum: { $ifNull: ['$overtimeHours', 0] } },
          },
        },
      ])
    : [];

  const byPicker = Object.fromEntries(agg.map((r) => [String(r._id), r]));

  return pickers.map((p) => {
    const row = byPicker[String(p._id)] || { daysWorked: 0, regularHours: 0, otHours: 0 };
    const agencyName = p.agencyId ? agencyById[String(p.agencyId)] || null : null;
    return {
      pickerName: p.name || '—',
      agency: agencyName,
      daysWorked: row.daysWorked || 0,
      regularHours: Number(row.regularHours || 0),
      otHours: Number(row.otHours || 0),
      month,
    };
  });
}

module.exports = {
  listPickers,
  updatePickerAssignment,
  updatePickerOpsStatus,
  listAgencies,
  createAgency,
  deactivateAgency,
  activateAgency,
  listStoreShiftSlots,
  createStoreShiftSlot,
  listOtRequests,
  decideOtRequest,
  listShiftChangeRequests,
  decideShiftChangeRequest,
  getAttendanceByMonth,
};

