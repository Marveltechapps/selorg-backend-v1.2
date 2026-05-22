/**
 * Sync warehouse Shift records from RiderShiftAssignment + RiderShift (source of truth for rider bookings).
 */
const Shift = require('../../warehouse/models/Shift');
const RiderShift = require('../../rider/models/RiderShift');
const RiderShiftAssignment = require('../../rider/models/RiderShiftAssignment');
const Rider = require('../../rider/models/Rider');
const logger = require('../../core/utils/logger');

function dayBounds(dateStr) {
  const parts = String(dateStr).split('-').map(Number);
  const y = parts[0] || new Date().getFullYear();
  const m = (parts[1] || 1) - 1;
  const d = parts[2] || 1;
  const startOfDay = new Date(y, m, d, 0, 0, 0, 0);
  const endOfDay = new Date(y, m, d, 23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

function formatCheckTime(date) {
  if (!date) return undefined;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return undefined;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function mapAssignmentStatus(status) {
  switch (status) {
    case 'started':
      return 'active';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'absent';
    default:
      return 'scheduled';
  }
}

/**
 * Upsert staff shifts for a calendar day from rider shift assignments.
 */
async function syncStaffShiftsFromAssignments(dateStr) {
  const { startOfDay, endOfDay } = dayBounds(dateStr);

  const assignments = await RiderShiftAssignment.find({
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['selected', 'started', 'completed'] },
  })
    .populate('shiftId')
    .lean();

  if (!assignments.length) {
    return { synced: 0 };
  }

  const riderIds = [...new Set(assignments.map((a) => a.riderId))];
  const riders = await Rider.find({ id: { $in: riderIds } })
    .select('id name zone')
    .lean();
  const riderById = new Map(riders.map((r) => [r.id, r]));

  let synced = 0;
  for (const assignment of assignments) {
    const riderShift = assignment.shiftId;
    if (!riderShift || typeof riderShift !== 'object') continue;

    const rider = riderById.get(assignment.riderId);
    const staffShiftId = `STAFF-SYNC-${String(assignment._id)}`;

    await Shift.findOneAndUpdate(
      { id: staffShiftId },
      {
        id: staffShiftId,
        staffId: assignment.riderId,
        staffName: rider?.name || assignment.riderId,
        date: new Date(riderShift.date || assignment.date),
        startTime: riderShift.startTime,
        endTime: riderShift.endTime,
        status: mapAssignmentStatus(assignment.status),
        checkInTime: formatCheckTime(assignment.startedAt),
        checkOutTime: formatCheckTime(assignment.endedAt),
        hub: riderShift.hubName || rider?.zone || 'Chennai Hub',
        isPeakHour: !!riderShift.isPeak,
        overtimeMinutes: 0,
      },
      { upsert: true, new: true }
    );
    synced += 1;
  }

  return { synced };
}

/**
 * Seed demo staff shifts when DB has riders but no shifts/assignments for the day.
 */
async function ensureDemoStaffShiftsForDate(dateStr) {
  const { startOfDay, endOfDay } = dayBounds(dateStr);

  const existing = await Shift.countDocuments({
    date: { $gte: startOfDay, $lte: endOfDay },
  });
  if (existing > 0) {
    return { seeded: 0, skipped: true };
  }

  const riders = await Rider.find({}).select('id name zone').limit(8).lean();
  if (!riders.length) {
    return { seeded: 0, skipped: true };
  }

  const slots = [
    { startTime: '08:00', endTime: '12:00', status: 'active', isPeakHour: true, checkInTime: '07:58' },
    { startTime: '12:00', endTime: '16:00', status: 'scheduled', isPeakHour: false },
    { startTime: '16:00', endTime: '20:00', status: 'scheduled', isPeakHour: true },
    { startTime: '08:00', endTime: '12:00', status: 'absent', isPeakHour: true },
  ];

  let seeded = 0;
  for (let i = 0; i < riders.length; i += 1) {
    const rider = riders[i];
    const slot = slots[i % slots.length];
    const id = `S-DEMO-${dateStr}-${rider.id}-${slot.startTime.replace(':', '')}`;
    await Shift.findOneAndUpdate(
      { id },
      {
        id,
        staffId: rider.id,
        staffName: rider.name,
        date: startOfDay,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status,
        checkInTime: slot.checkInTime,
        hub: rider.zone ? `${rider.zone} Hub` : 'Chennai Hub',
        isPeakHour: slot.isPeakHour,
      },
      { upsert: true, new: true }
    );
    seeded += 1;
  }

  return { seeded };
}

/**
 * Ensure staff shifts exist for dashboard: sync assignments first, then demo seed if still empty.
 */
async function ensureStaffShiftsForDate(dateStr) {
  try {
    const syncResult = await syncStaffShiftsFromAssignments(dateStr);
    const { startOfDay, endOfDay } = dayBounds(dateStr);
    const countAfterSync = await Shift.countDocuments({
      date: { $gte: startOfDay, $lte: endOfDay },
    });
    if (countAfterSync > 0) {
      return { ...syncResult, total: countAfterSync };
    }
    const demo = await ensureDemoStaffShiftsForDate(dateStr);
    return { ...syncResult, ...demo, total: demo.seeded };
  } catch (error) {
    logger.error('ensureStaffShiftsForDate error:', error);
    throw error;
  }
}

module.exports = {
  syncStaffShiftsFromAssignments,
  ensureDemoStaffShiftsForDate,
  ensureStaffShiftsForDate,
  dayBounds,
};
