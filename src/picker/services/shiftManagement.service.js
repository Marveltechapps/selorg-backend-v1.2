/**
 * Shift Management service – Dashboard CRUD and roster for picker shifts.
 */
const PickerShift = require('../models/shift.model');
const ShiftAssignment = require('../models/shiftAssignment.model');
const PickerUser = require('../models/user.model');
const mongoose = require('mongoose');

/**
 * List shifts with filters
 * @param {Object} filters - { site, siteId, startDate, endDate, status }
 */
async function listShifts(filters = {}) {
  const query = {};
  if (filters.site) query.site = filters.site;
  if (filters.siteId) query.siteId = filters.siteId;
  if (filters.status) query.status = filters.status;

  const shifts = await PickerShift.find(query).sort({ startTime: 1 }).lean();
  const ids = shifts.map((s) => s._id);

  const assignedCounts = await ShiftAssignment.aggregate([
    { $match: { shiftId: { $in: ids } } },
    { $group: { _id: '$shiftId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  assignedCounts.forEach((a) => { countMap[a._id.toString()] = a.count; });

  return shifts.map((s) => ({
    id: s._id?.toString?.() ?? s.id,
    name: s.name,
    site: s.site ?? s.siteId ?? '—',
    siteId: s.siteId,
    startTime: s.startTime ?? s.time,
    endTime: s.endTime ?? s.time,
    timeRange: formatTimeRange(s.startTime, s.endTime, s.time),
    capacity: s.capacity ?? 1,
    breakDuration: s.breakDuration ?? 0,
    status: s.status ?? 'SCHEDULED',
    assignedCount: countMap[s._id?.toString()] ?? 0,
  }));
}

function formatTimeRange(start, end, fallback) {
  if (start && end) return `${start} - ${end}`;
  if (fallback) return fallback;
  return '—';
}

/**
 * Create shift
 */
async function createShift(body) {
  const doc = await PickerShift.create({
    name: body.name,
    site: body.site,
    siteId: body.siteId,
    startTime: body.startTime,
    endTime: body.endTime,
    capacity: body.capacity ?? 1,
    breakDuration: body.breakDuration ?? 0,
    status: body.status ?? 'SCHEDULED',
  });
  return toShiftDto(doc);
}

/**
 * Update shift
 */
async function updateShift(id, body) {
  const doc = await PickerShift.findByIdAndUpdate(
    id,
    {
      ...(body.name != null && { name: body.name }),
      ...(body.site != null && { site: body.site }),
      ...(body.siteId != null && { siteId: body.siteId }),
      ...(body.startTime != null && { startTime: body.startTime }),
      ...(body.endTime != null && { endTime: body.endTime }),
      ...(body.capacity != null && { capacity: body.capacity }),
      ...(body.breakDuration != null && { breakDuration: body.breakDuration }),
      ...(body.status != null && { status: body.status }),
    },
    { new: true }
  );
  if (!doc) return null;
  return toShiftDto(doc);
}

function toShiftDto(doc) {
  const s = doc.toObject ? doc.toObject() : doc;
  return {
    id: s._id?.toString?.() ?? s.id,
    name: s.name,
    site: s.site ?? s.siteId ?? '—',
    siteId: s.siteId,
    startTime: s.startTime ?? s.time,
    endTime: s.endTime ?? s.time,
    timeRange: formatTimeRange(s.startTime, s.endTime, s.time),
    capacity: s.capacity ?? 1,
    breakDuration: s.breakDuration ?? 0,
    status: s.status ?? 'SCHEDULED',
  };
}

/**
 * Get roster for date range
 * @param {string} startDate - ISO date
 * @param {string} endDate - ISO date
 */
async function getRoster(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const shifts = await PickerShift.find({}).sort({ startTime: 1 }).lean();
  const shiftIds = shifts.map((s) => s._id);

  const assignments = await ShiftAssignment.find({
    shiftId: { $in: shiftIds },
    date: { $gte: start, $lte: end },
  }).lean();

  const pickerIds = [...new Set(assignments.map((a) => a.pickerId?.toString?.()).filter(Boolean))];
  const pickerDocs = await PickerUser.find({ _id: { $in: pickerIds } }).select('name phone').lean();
  const pickersById = {};
  pickerDocs.forEach((p) => { pickersById[p._id.toString()] = p; });

  const roster = [];
  const d = new Date(start);
  while (d <= end) {
    const dateStr = d.toISOString().split('T')[0];
    for (const shift of shifts) {
      const shiftAssignments = assignments.filter((a) => {
        const aDate = a.date instanceof Date ? a.date : new Date(a.date);
        const aStr = aDate.toISOString().split('T')[0];
        return a.shiftId?.toString?.() === shift._id?.toString?.() && aStr === dateStr;
      });
      const assigned = shiftAssignments.map((a) => {
        const p = a.pickerId?.toObject ? a.pickerId.toObject() : (a.pickerId && pickersById[a.pickerId.toString?.()]) || a.pickerId;
        return { pickerId: p?._id?.toString?.() ?? a.pickerId?.toString?.(), name: p?.name ?? 'Unknown' };
      });
      const emptySlots = Math.max(0, (shift.capacity ?? 1) - assigned.length);
      roster.push({
        date: dateStr,
        shiftId: shift._id?.toString?.(),
        shiftName: shift.name,
        site: shift.site ?? shift.siteId ?? '—',
        timeRange: formatTimeRange(shift.startTime, shift.endTime, shift.time),
        capacity: shift.capacity ?? 1,
        assignedPickers: assigned,
        emptySlots,
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return roster;
}

/**
 * Assign picker to shift for a date
 */
async function assignPicker(shiftId, pickerId, date) {
  const shift = await PickerShift.findById(shiftId);
  if (!shift) return { success: false, error: 'Shift not found' };
  const picker = await PickerUser.findById(pickerId);
  if (!picker) return { success: false, error: 'Picker not found' };

  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const existing = await ShiftAssignment.findOne({ shiftId, pickerId, date: d });
  if (existing) return { success: true, message: 'Already assigned' };

  const count = await ShiftAssignment.countDocuments({ shiftId, date: d });
  if (count >= (shift.capacity ?? 1)) return { success: false, error: 'Shift capacity reached' };

  await ShiftAssignment.create({
    shiftId,
    pickerId,
    date: d,
    status: 'SCHEDULED',
  });
  return { success: true };
}

/**
 * Remove picker from shift for a date (optional - for unassign)
 */
async function unassignPicker(shiftId, pickerId, date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  await ShiftAssignment.deleteOne({ shiftId, pickerId, date: d });
  return { success: true };
}

async function listActivePickers() {
  const { PICKER_STATUS } = require('../../constants/pickerEnums');
  const pickers = await PickerUser.find({ status: PICKER_STATUS.ACTIVE })
    .select('_id name phone')
    .sort({ name: 1 })
    .lean();
  return pickers.map((p) => ({ id: p._id.toString(), name: p.name || p.phone || 'Unknown', phone: p.phone }));
}

module.exports = {
  listShifts,
  createShift,
  updateShift,
  getRoster,
  assignPicker,
  unassignPicker,
  listActivePickers,
};
