/**
 * Live Attendance service – returns today's picker attendance with computed fields.
 * Used by GET /warehouse/attendance/live for the Live Attendance dashboard screen.
 */
const mongoose = require('mongoose');
const PickerAttendance = require('../../picker/models/attendance.model');
const PickerUser = require('../../picker/models/user.model');
const PickerShift = require('../../picker/models/shift.model');
const { mergeWarehouseFilter } = require('../constants/warehouseScope');

/**
 * Get live attendance for a date.
 * @param {Object} opts - { date (YYYY-MM-DD or Date), site (optional) }
 * @returns {Promise<Array>} Rows: pickerName, shift, punchIn, duration, lateByMinutes, overtimeMinutes, status
 */
async function getLiveAttendance(warehouseKey, opts = {}) {
  const dateStr = opts.date || new Date().toISOString().split('T')[0];
  const date = typeof dateStr === 'string' ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  const site = opts.site ? String(opts.site).trim() : null;

  const match = mergeWarehouseFilter({ punchIn: { $gte: dayStart, $lte: dayEnd } }, warehouseKey);
  const attendances = await PickerAttendance.find(match)
    .sort({ punchIn: -1 })
    .lean();

  const userIds = [...new Set(attendances.map((a) => a.userId?.toString()).filter(Boolean))];
  const shiftIds = [...new Set(attendances.map((a) => a.shiftId).filter(Boolean))];

  const [users, shifts] = await Promise.all([
    PickerUser.find({ _id: { $in: userIds } }).select('name phone').lean(),
    PickerShift.find(
      mergeWarehouseFilter({
        $or: [
          { _id: { $in: shiftIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) } },
          { id: { $in: shiftIds } },
        ],
      }, warehouseKey)
    ).lean(),
  ]);

  const userMap = users.reduce((acc, u) => {
    acc[String(u._id)] = u;
    return acc;
  }, {});

  const shiftMap = {};
  for (const s of shifts) {
    shiftMap[String(s._id)] = s;
    if (s.id) shiftMap[String(s.id)] = s;
  }

  const rows = [];
  for (const a of attendances) {
    if (site) {
      const shift = shiftMap[a.shiftId] || shiftMap[String(a.shiftId)];
      if (shift && shift.site && String(shift.site).toLowerCase() !== String(site).toLowerCase()) {
        continue;
      }
    }

    const user = userMap[String(a.userId)];
    const shift = shiftMap[a.shiftId] || shiftMap[String(a.shiftId)];
    const punchIn = a.punchIn;
    let duration = 0;
    if (a.punchOut) {
      const totalMs = a.punchOut - a.punchIn;
      const breakMs = (a.breaks || []).reduce((sum, b) => {
        if (b.startTime && b.endTime) return sum + (b.endTime - b.startTime);
        return sum;
      }, 0);
      duration = Math.round((totalMs - breakMs) / 60000);
    } else {
      const now = new Date();
      const totalMs = now - a.punchIn;
      const breakMs = (a.breaks || []).reduce((sum, b) => {
        if (b.startTime && b.endTime) return sum + (b.endTime - b.startTime);
        if (b.startTime) return sum + (now - b.startTime);
        return sum;
      }, 0);
      duration = Math.round((totalMs - breakMs) / 60000);
    }

    let status = a.status || 'present';
    if (a.punchOut) {
      status = 'COMPLETED';
    } else if (status === 'ON_BREAK') {
      status = 'ON_BREAK';
    } else {
      status = 'ON_DUTY';
    }

    rows.push({
      id: String(a._id),
      userId: String(a.userId),
      pickerName: user?.name || user?.phone || 'Unknown',
      shift: shift?.name || shift?.time || a.shiftId || '--',
      punchIn: punchIn ? punchIn.toISOString() : null,
      punchOut: a.punchOut ? a.punchOut.toISOString() : null,
      duration,
      lateByMinutes: a.lateByMinutes ?? 0,
      overtimeMinutes: a.overtimeMinutes ?? 0,
      totalWorkedMinutes: a.totalWorkedMinutes ?? 0,
      status,
    });
  }

  return rows;
}

module.exports = { getLiveAttendance };
