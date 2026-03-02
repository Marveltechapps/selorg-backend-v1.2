/**
 * Rider Fleet Staff & Shifts Controller
 * Serves rider shifts for StaffShifts screen.
 * Mounted at /api/v1/staff
 */

const Shift = require('../../warehouse/models/Shift');
function getRiderModel() {
  try {
    return require('../../rider/models/Rider');
  } catch {
    try {
      const m = require('../../rider_v2_backend/src/models/Rider');
      return m.Rider || m;
    } catch {
      return null;
    }
  }
}
const Rider = getRiderModel();
const logger = require('../../core/utils/logger');

const toRiderShift = (s) => ({
  id: s.id,
  riderId: s.staffId,
  riderName: s.staffName,
  date: s.date ? (typeof s.date === 'string' ? s.date : new Date(s.date).toISOString().split('T')[0]) : null,
  startTime: s.startTime,
  endTime: s.endTime,
  status: s.status,
  checkInTime: s.checkInTime || undefined,
  checkOutTime: s.checkOutTime || undefined,
  hub: s.hub,
  isPeakHour: !!s.isPeakHour,
  overtimeMinutes: s.overtimeMinutes || 0,
});

/**
 * GET /staff/summary
 */
const getSummary = async (req, res, next) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const shifts = await Shift.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const checkedInCount = shifts.filter(
      (s) => s.status === 'active' || s.status === 'completed'
    ).length;
    const absentOrLateCount = shifts.filter(
      (s) => s.status === 'absent' || s.status === 'late'
    ).length;

    res.status(200).json({
      date: dateStr,
      checkedInCount,
      scheduledTodayCount: shifts.length,
      absentOrLateCount,
    });
  } catch (error) {
    logger.error('Staff getSummary error:', error);
    next(error);
  }
};

/**
 * GET /staff/shifts
 */
const listShifts = async (req, res, next) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const shifts = await Shift.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ startTime: 1 })
      .lean();

    res.status(200).json(shifts.map(toRiderShift));
  } catch (error) {
    logger.error('Staff listShifts error:', error);
    next(error);
  }
};

/**
 * GET /staff/shifts/:id
 */
const getShiftById = async (req, res, next) => {
  try {
    const shift = await Shift.findOne({ id: req.params.id }).lean();
    if (!shift) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shift not found',
        code: 'SHIFT_NOT_FOUND',
      });
    }
    res.status(200).json(toRiderShift(shift));
  } catch (error) {
    logger.error('Staff getShiftById error:', error);
    next(error);
  }
};

/**
 * POST /staff/shifts
 */
const createShift = async (req, res, next) => {
  try {
    const body = req.body;
    const riderId = body.riderId || body.staffId;
    const riderName = body.riderName || body.staffName;

    if (!riderId || !body.date || !body.startTime || !body.endTime || !body.hub) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'riderId (or staffId), date, startTime, endTime, and hub are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    let name = riderName;
    if (!name && Rider) {
      const rider = await Rider.findOne({ id: riderId }).select('name').lean();
      name = rider ? rider.name : 'Unknown Rider';
    }
    if (!name) name = 'Unknown Rider';

    const count = await Shift.countDocuments();
    const id = body.id || `S-${Date.now()}-${(count + 1).toString().padStart(3, '0')}`;

    const shiftData = {
      id,
      staffId: riderId,
      staffName: name,
      date: new Date(body.date),
      startTime: body.startTime,
      endTime: body.endTime,
      status: body.status || 'scheduled',
      hub: body.hub,
      isPeakHour: !!body.isPeakHour,
    };

    const shift = await Shift.create(shiftData);
    res.status(201).json(toRiderShift(shift.toObject()));
  } catch (error) {
    logger.error('Staff createShift error:', error);
    next(error);
  }
};

/**
 * PUT /staff/shifts/:id
 */
const updateShift = async (req, res, next) => {
  try {
    const shift = await Shift.findOne({ id: req.params.id });
    if (!shift) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shift not found',
        code: 'SHIFT_NOT_FOUND',
      });
    }

    const allowed = [
      'status',
      'checkInTime',
      'checkOutTime',
      'overtimeMinutes',
      'startTime',
      'endTime',
      'hub',
      'isPeakHour',
    ];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        shift[key] = req.body[key];
      }
    });

    await shift.save();
    res.status(200).json(toRiderShift(shift.toObject()));
  } catch (error) {
    logger.error('Staff updateShift error:', error);
    next(error);
  }
};

/**
 * GET /staff (list riders for create shift)
 */
const listRiders = async (req, res, next) => {
  try {
    if (!Rider) {
      return res.status(200).json([]);
    }
    const riders = await Rider.find({}).select('id name zone').lean();
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const shifts = await Shift.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const hoursByRider = {};
    shifts.forEach((s) => {
      const rid = s.staffId;
      if (!hoursByRider[rid]) hoursByRider[rid] = 0;
      const start = s.startTime ? s.startTime.split(':').map(Number) : [0, 0];
      const end = s.endTime ? s.endTime.split(':').map(Number) : [0, 0];
      hoursByRider[rid] += (end[0] - start[0]) + (end[1] - start[1]) / 60;
    });

    const result = riders.map((r) => ({
      id: r.id,
      name: r.name,
      hub: r.zone || r.hub || 'Default Hub',
      existingHours: Math.round((hoursByRider[r.id] || 0) * 10) / 10,
    }));

    res.status(200).json(result);
  } catch (error) {
    logger.error('Staff listRiders error:', error);
    next(error);
  }
};

module.exports = {
  getSummary,
  listShifts,
  getShiftById,
  createShift,
  updateShift,
  listRiders,
};
