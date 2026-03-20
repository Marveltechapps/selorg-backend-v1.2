const RiderShift = require('../models/RiderShift');
const RiderShiftAssignment = require('../models/RiderShiftAssignment');

function parseTimeToMinutes(time) {
  if (!time || typeof time !== 'string') return null;
  const [hours, minutes] = time.split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const diffMs = endDate.getTime() - startDate.getTime();
  if (Number.isNaN(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 60000);
}

async function generateShiftId() {
  // Find the latest created shift and extract the numeric suffix from its id
  const latest = await RiderShift.findOne().sort({ createdAt: -1 }).select('id');

  let nextNumber = 1;
  if (latest && typeof latest.id === 'string') {
    const match = latest.id.match(/RSHIFT-(\d+)/i);
    if (match && match[1]) {
      const current = parseInt(match[1], 10);
      if (!Number.isNaN(current)) {
        nextNumber = current + 1;
      }
    }
  }

  const padded = String(nextNumber).padStart(4, '0');
  return `RSHIFT-${padded}`;
}

function shiftsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function createShift(payload) {
  const { startTime, endTime } = payload;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    const error = new Error('Invalid shift time window');
    error.code = 'INVALID_TIME_WINDOW';
    throw error;
  }

  const durationMinutes = endMinutes - startMinutes;
  const id = payload.id || (await generateShiftId());

  const shift = new RiderShift({
    ...payload,
    id,
    durationMinutes,
  });
  return shift.save();
}

async function getShiftById(id) {
  return RiderShift.findOne({ id });
}

async function listShifts(filters = {}, options = {}) {
  const query = {};

  if (filters.date) {
    const date = new Date(filters.date);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    query.date = { $gte: start, $lt: end };
  }

  if (filters.hubId) {
    query.hubId = filters.hubId;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  const limit = Math.min(options.limit || 50, 200);
  const page = Math.max(options.page || 1, 1);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    RiderShift.find(query).sort({ date: 1, startTime: 1 }).skip(skip).limit(limit),
    RiderShift.countDocuments(query),
  ]);

  return {
    items,
    total,
    page,
    pageSize: limit,
  };
}

async function updateShift(id, updates) {
  const shift = await RiderShift.findOne({ id });
  if (!shift) return null;

  if (updates.startTime || updates.endTime) {
    const startTime = updates.startTime ?? shift.startTime;
    const endTime = updates.endTime ?? shift.endTime;
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
      const error = new Error('Invalid shift time window');
      error.code = 'INVALID_TIME_WINDOW';
      throw error;
    }
    shift.durationMinutes = endMinutes - startMinutes;
  }

  Object.assign(shift, updates);
  return shift.save();
}

async function deleteShift(id) {
  const shift = await RiderShift.findOne({ id });
  if (!shift) return null;
  shift.status = 'cancelled';
  return shift.save();
}

async function getAvailableForRider(riderId, { date }) {
  const base = await listShifts({ date, status: 'published' }, { limit: 200 });
  if (!base.items.length) return [];

  const shiftIds = base.items.map((s) => s._id);
  const assignments = await RiderShiftAssignment.find({
    shiftId: { $in: shiftIds },
    status: { $in: ['selected', 'started'] },
  });

  const countsByShiftId = assignments.reduce((acc, a) => {
    const key = String(a.shiftId);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return base.items
    .map((shift) => ({
      id: shift.id,
      hubId: shift.hubId,
      hubName: shift.hubName,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      durationMinutes: shift.durationMinutes,
      capacity: shift.capacity,
      bookedCount: countsByShiftId[String(shift._id)] || 0,
      isPeak: shift.isPeak,
      basePay: shift.basePay,
      bonus: shift.bonus,
      currency: shift.currency,
      breakMinutes: shift.breakMinutes,
      walkInBufferMinutes: shift.walkInBufferMinutes,
    }));
}

async function selectShifts(riderId, shiftIds = []) {
  if (!Array.isArray(shiftIds) || shiftIds.length === 0) {
    const error = new Error('No shifts selected');
    error.code = 'NO_SHIFTS_SELECTED';
    throw error;
  }

  const shifts = await RiderShift.find({ id: { $in: shiftIds }, status: 'published' });
  if (!shifts.length) {
    const error = new Error('No valid shifts found');
    error.code = 'NO_VALID_SHIFTS';
    throw error;
  }

  const byId = new Map(shifts.map((s) => [s.id, s]));

  const date = shifts[0].date;
  const existingAssignments = await RiderShiftAssignment.find({
    riderId,
    date,
    status: { $in: ['selected', 'started'] },
  }).populate('shiftId');

  const existingWindows = existingAssignments
    .map((a) => {
      const shift = a.shiftId;
      if (!shift) return null;
      return {
        start: parseTimeToMinutes(shift.startTime),
        end: parseTimeToMinutes(shift.endTime),
      };
    })
    .filter(Boolean);

  // Track current active assignment counts per shift so we can both enforce
  // capacity and update bookedCount accurately after creation.
  const activeCountByShiftObjectId = new Map();

  for (const id of shiftIds) {
    const shift = byId.get(id);
    if (!shift) {
      const error = new Error(`Shift not found: ${id}`);
      error.code = 'SHIFT_NOT_FOUND';
      throw error;
    }

    const start = parseTimeToMinutes(shift.startTime);
    const end = parseTimeToMinutes(shift.endTime);
    if (start == null || end == null) {
      const error = new Error(`Invalid time window for shift: ${id}`);
      error.code = 'INVALID_TIME_WINDOW';
      throw error;
    }

    if (existingWindows.some((w) => shiftsOverlap(start, end, w.start, w.end))) {
      const error = new Error('Shift overlaps with existing selection');
      error.code = 'SHIFT_OVERLAP';
      throw error;
    }

    let activeAssignmentsCount = activeCountByShiftObjectId.get(String(shift._id));
    if (activeAssignmentsCount == null) {
      activeAssignmentsCount = await RiderShiftAssignment.countDocuments({
        shiftId: shift._id,
        status: { $in: ['selected', 'started'] },
      });
      activeCountByShiftObjectId.set(String(shift._id), activeAssignmentsCount);
    }

    if (activeAssignmentsCount >= shift.capacity) {
      const error = new Error('Shift capacity reached');
      error.code = 'CAPACITY_REACHED';
      throw error;
    }

    existingWindows.push({ start, end });
  }

  const assignmentsToCreate = shiftIds.map((id) => {
    const shift = byId.get(id);
    return {
      shiftId: shift._id,
      riderId,
      date: shift.date,
      status: 'selected',
    };
  });

  await RiderShiftAssignment.insertMany(assignmentsToCreate);

  // After successfully creating assignments, update bookedCount on each
  // affected RiderShift so the dashboard can show the current booking count.
  const additionalCountByShiftObjectId = assignmentsToCreate.reduce((acc, a) => {
    const key = String(a.shiftId);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const bulkOps = Object.keys(additionalCountByShiftObjectId).map((key) => {
    const incrementBy = additionalCountByShiftObjectId[key];
    return {
      updateOne: {
        filter: { _id: key },
        update: { $inc: { bookedCount: incrementBy } },
      },
    };
  });

  if (bulkOps.length) {
    await RiderShift.bulkWrite(bulkOps);
  }
}

async function startShift(riderId, shiftId, timestamp = new Date()) {
  const shift = await RiderShift.findOne({ id: shiftId, status: 'published' });
  if (!shift) {
    const error = new Error('Shift not found');
    error.code = 'SHIFT_NOT_FOUND';
    throw error;
  }

  const assignment = await RiderShiftAssignment.findOne({
    riderId,
    shiftId: shift._id,
    status: { $in: ['selected', 'started'] },
  });

  if (!assignment) {
    const error = new Error('Shift not selected');
    error.code = 'SHIFT_NOT_SELECTED';
    throw error;
  }

  const buf = shift.walkInBufferMinutes ?? 0;
  const now = new Date(timestamp);
  const shiftStart = new Date(shift.date);
  const [h, m] = shift.startTime.split(':').map((v) => parseInt(v, 10));
  shiftStart.setHours(h || 0, m || 0, 0, 0);

  const earliest = new Date(shiftStart.getTime() - buf * 60 * 1000);
  const latest = new Date(shiftStart.getTime() + buf * 60 * 1000);

  if (now < earliest || now > latest) {
    const error = new Error('Cannot start shift outside allowed window');
    error.code = 'OUTSIDE_START_WINDOW';
    throw error;
  }

  assignment.status = 'started';
  assignment.startedAt = now;
  await assignment.save();

  return { shiftStartTime: now };
}

async function endShift(riderId, shiftId, timestamp = new Date()) {
  const shift = await RiderShift.findOne({ id: shiftId });
  if (!shift) {
    const error = new Error('Shift not found');
    error.code = 'SHIFT_NOT_FOUND';
    throw error;
  }

  const assignment = await RiderShiftAssignment.findOne({
    riderId,
    shiftId: shift._id,
    status: 'started',
  });

  if (!assignment) {
    const error = new Error('Shift not started');
    error.code = 'SHIFT_NOT_STARTED';
    throw error;
  }

  assignment.status = 'completed';
  assignment.endedAt = new Date(timestamp);
  await assignment.save();
}

async function listRiderShifts(riderId, { date, status } = {}) {
  const query = { riderId };
  console.log('[ShiftService] listRiderShifts', { riderId, date, status });

  if (date) {
    const d = new Date(date);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    query.date = { $gte: start, $lt: end };
  }

  if (status) {
    query.status = Array.isArray(status) ? { $in: status } : status;
  }

  const assignments = await RiderShiftAssignment.find(query).populate('shiftId').sort({ date: 1 });
  console.log('[ShiftService] found assignments', assignments.length);
  const now = new Date();

  return assignments
    .filter((a) => {
      if (!a.shiftId) console.warn('[ShiftService] Assignment missing shiftId', a._id);
      return !!a.shiftId;
    })
    .map((a) => {
      const s = a.shiftId;

      const shiftDate = new Date(s.date);
      const startMinutes = parseTimeToMinutes(s.startTime);
      const endMinutes = parseTimeToMinutes(s.endTime);

      let windowStart = null;
      let windowEnd = null;
      if (!Number.isNaN(shiftDate.getTime()) && startMinutes != null && endMinutes != null) {
        windowStart = new Date(shiftDate);
        windowStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
        windowEnd = new Date(shiftDate);
        windowEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
      }

      let temporalCategory = 'upcoming';
      if (windowStart && windowEnd) {
        if (now < windowStart) {
          temporalCategory = 'upcoming';
        } else if (now >= windowStart && now <= windowEnd) {
          temporalCategory = 'ongoing';
        } else {
          temporalCategory = 'past';
        }
      }

      const scheduledMinutes =
        typeof s.durationMinutes === 'number' && s.durationMinutes > 0 && Number.isFinite(s.durationMinutes)
          ? s.durationMinutes
          : startMinutes != null && endMinutes != null && endMinutes > startMinutes
          ? endMinutes - startMinutes
          : 0;

      let attendedMinutes = 0;
      if (a.startedAt) {
        if (a.endedAt) {
          attendedMinutes = minutesBetween(a.startedAt, a.endedAt);
        } else if (temporalCategory === 'ongoing') {
          attendedMinutes = minutesBetween(a.startedAt, now);
        }
      } else if (temporalCategory === 'ongoing' && windowStart) {
        // Rider is in the current shift window but we don't yet have a startedAt
        // timestamp (e.g. legacy data or start event not captured). In this case,
        // approximate active time from the scheduled start of the slot.
        attendedMinutes = minutesBetween(windowStart, now);
      }
      const attendancePercentage =
        scheduledMinutes > 0 ? Math.min(100, Math.round((attendedMinutes / scheduledMinutes) * 100)) : 0;

      let completionStatus = 'upcoming';
      if (temporalCategory === 'upcoming') {
        completionStatus = 'upcoming';
      } else if (temporalCategory === 'ongoing') {
        // As soon as the current time falls inside the booked slot window,
        // always treat this as the rider's current shift, regardless of whether
        // they've explicitly "started" it yet.
        completionStatus = 'ongoing';
      } else {
        // past window
        if (!a.startedAt) {
          completionStatus = 'missed';
        } else if (a.status === 'completed') {
          completionStatus = attendancePercentage >= 90 ? 'completed' : 'missed';
        } else {
          completionStatus = 'missed';
        }
      }

      return {
        id: s.id,
        hubId: s.hubId,
        hubName: s.hubName,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMinutes: s.durationMinutes,
        capacity: s.capacity,
        bookedCount: s.bookedCount,
        status: a.status,
        isPeak: s.isPeak,
        basePay: s.basePay,
        bonus: s.bonus,
        currency: s.currency,
        breakMinutes: s.breakMinutes,
        walkInBufferMinutes: s.walkInBufferMinutes,
        assignmentId: a._id,
        assignmentStatus: a.status,
        startedAt: a.startedAt,
        endedAt: a.endedAt,
        attendanceMinutes: attendedMinutes,
        attendancePercentage,
        completionStatus,
      };
    });
}

module.exports = {
  createShift,
  getShiftById,
  listShifts,
  updateShift,
  deleteShift,
  getAvailableForRider,
  selectShifts,
  startShift,
  endShift,
  listRiderShifts,
};

