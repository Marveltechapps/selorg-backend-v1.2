const workforceService = require('../services/workforceService');
const cache = require('../../utils/cache');
const logger = require('../../core/utils/logger');
const { getCachedOrCompute, hashForKey } = require('../../utils/cacheHelper');
const appConfig = require('../../config/app');
const cacheInvalidation = require('../cacheInvalidation');

/**
 * Get staff summary (read-through cache)
 */
const getStaffSummary = async (req, res, next) => {
  try {
    const { value: summary } = await getCachedOrCompute(
      `staff:summary:${req.user?.warehouseKey || 'unknown'}`,
      appConfig.cache.staff,
      async () => {
        const staff = await workforceService.listStaff(req.user.warehouseKey);
        return {
          total: staff.length,
          active: staff.filter(s => s.status === 'active').length,
          onBreak: staff.filter(s => s.status === 'break').length,
          offline: staff.filter(s => s.status === 'offline').length,
        };
      },
      res
    );
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

/**
 * List staff members (read-through cache)
 */
const listStaff = async (req, res, next) => {
  try {
    const filters = {
      role: req.query.role,
      status: req.query.status,
      zone: req.query.zone,
      search: req.query.search,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    };
    const cacheKey = `staff:list:${req.user?.warehouseKey || 'unknown'}:${hashForKey(filters)}`;
    const { value: result } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.staff,
      async () => {
        const staff = await workforceService.listStaff(req.user.warehouseKey);
        const q = filters.search ? String(filters.search).toLowerCase().trim() : '';

        let filtered = staff;
        if (filters.role) filtered = filtered.filter(s => s.role === filters.role);
        if (filters.status) filtered = filtered.filter(s => s.status === filters.status);
        if (filters.zone) filtered = filtered.filter(s => s.zone === filters.zone);
        if (q) {
          filtered = filtered.filter(s =>
            [s.name, s.id, s.role, s.email].some(v =>
              (v || '').toString().toLowerCase().includes(q)
            )
          );
        }

        const start = (filters.page - 1) * filters.limit;
        const end = start + filters.limit;
        return filtered.slice(start, end);
      },
      res
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * List shifts (read-through cache)
 */
const listShifts = async (req, res, next) => {
  try {
    const filters = {
      date: req.query.date,
      staffId: req.query.staffId,
      status: req.query.status,
      week: req.query.week ? parseInt(req.query.week) : null,
    };
    const cacheKey = `staff:shifts:${req.user?.warehouseKey || 'unknown'}:${hashForKey(filters)}`;
    const { value: result } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.staff,
      async () => {
        const shifts = await workforceService.listShifts(req.user.warehouseKey);

        let filtered = shifts;
        if (filters.date) {
          filtered = filtered.filter(s => s.date === filters.date);
        }
        if (filters.staffId) {
          filtered = filtered.filter(s => (s.staffAssigned || []).includes(filters.staffId));
        }
        if (filters.status) {
          filtered = filtered.filter(s => s.status === filters.status);
        }
        if (filters.week != null) {
          const isoWeek = d => {
            const date = new Date(d);
            const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = tmp.getUTCDay() || 7;
            tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
            return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
          };
          filtered = filtered.filter(s => isoWeek(s.date) === filters.week);
        }

        return filtered;
      },
      res
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Create shift
 */
const createShift = async (req, res, next) => {
  try {
    const shiftData = req.body;

    if (!shiftData.staffId || !shiftData.date || !shiftData.startTime || !shiftData.endTime || !shiftData.hub) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'staffId, date, startTime, endTime, and hub are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const shift = await workforceService.createShift(req.user.warehouseKey, shiftData);
    
    // Invalidate cache
    await cache.delByPattern('staff:*');
    await cache.del('staff:summary');
    await cache.delByPattern(`staff:shifts:*`);
    await cacheInvalidation.invalidateWarehouse().catch(() => {});
    
    res.status(201).json(shift);
  } catch (error) {
    logger.error('Error in createShift controller:', error);
    if (error.message === 'Staff member not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Staff member not found',
        code: 'STAFF_NOT_FOUND',
      });
    }
    if (error.message === 'Shift conflict detected' || error.message.includes('conflict')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.message,
        code: 'SHIFT_CONFLICT',
      });
    }
    next(error);
  }
};

/**
 * Get shift by ID
 */
const getShiftById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shifts = await workforceService.listShifts(req.user.warehouseKey);
    const shift = shifts.find(s => s.id === id);
    if (!shift) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shift not found',
        code: 'SHIFT_NOT_FOUND',
      });
    }
    res.status(200).json(shift);
  } catch (error) {
    next(error);
  }
};

/**
 * Update shift
 */
const updateShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const shift = await workforceService.updateShift(req.user.warehouseKey, id, updates);
    
    // Invalidate cache
    await cache.delByPattern('staff:*');
    await cache.del('staff:summary');
    await cache.delByPattern(`staff:shifts:*`);
    await cacheInvalidation.invalidateWarehouse().catch(() => {});
    
    res.status(200).json(shift);
  } catch (error) {
    logger.error('Error in updateShift controller:', error);
    if (error.message === 'Shift not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shift not found',
        code: 'SHIFT_NOT_FOUND',
      });
    }
    next(error);
  }
};

/**
 * Get shift coverage
 */
const getShiftCoverage = async (req, res, next) => {
  try {
    const date = req.query.date;
    const shifts = await workforceService.listShifts(req.user.warehouseKey);
    const result = {
      date: date || new Date().toISOString().split('T')[0],
      totalShifts: shifts.length,
      covered: shifts.filter(s => s.status === 'full').length,
      understaffed: shifts.filter(s => s.status === 'understaffed').length,
    };
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get weekly roster
 */
const getWeeklyRoster = async (req, res, next) => {
  try {
    const week = req.query.week ? parseInt(req.query.week) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;
    const shifts = await workforceService.listShifts(req.user.warehouseKey);
    const result = {
      week: week || 1,
      year: year || new Date().getFullYear(),
      shifts: shifts,
    };
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Publish weekly roster
 */
const publishWeeklyRoster = async (req, res, next) => {
  try {
    const { week, year } = req.body;

    if (!week || !year) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Week and year are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const result = {
      week,
      year,
      published: true,
      message: 'Roster published successfully',
    };
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * List absences
 */
const listAbsences = async (req, res, next) => {
  try {
    const filters = {
      date: req.query.date,
      type: req.query.type,
    };
    const leaveRequests = await workforceService.listLeaveRequests(req.user.warehouseKey, filters);
    res.status(200).json(leaveRequests);
  } catch (error) {
    next(error);
  }
};

/**
 * Log absence
 */
const logAbsence = async (req, res, next) => {
  try {
    const absenceData = req.body;

    if (!absenceData.staffId || !absenceData.reason || !absenceData.type || !absenceData.date) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'staffId, reason, type, and date are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const leaveRequest = await workforceService.createLeaveRequest(req.user.warehouseKey, {
      staffId: absenceData.staffId,
      leaveType: absenceData.type,
      startDate: absenceData.date,
      endDate: absenceData.date,
      reason: absenceData.reason,
      status: 'pending',
    });
    res.status(201).json(leaveRequest);
  } catch (error) {
    if (error.message === 'Staff member not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Staff member not found',
        code: 'STAFF_NOT_FOUND',
      });
    }
    next(error);
  }
};

/**
 * Auto-assign overtime shifts
 */
const autoAssignShifts = async (req, res, next) => {
  try {
    const assignmentData = req.body;

    if (!assignmentData.date || !assignmentData.timeSlot) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'date and timeSlot are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const result = {
      date: assignmentData.date,
      timeSlot: assignmentData.timeSlot,
      assigned: [],
      message: 'Auto-assignment completed',
    };
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get staff performance
 */
const getStaffPerformance = async (req, res, next) => {
  try {
    const params = {
      sortBy: req.query.sortBy || 'productivity',
      order: req.query.order || 'desc',
      period: req.query.period || 'week',
    };
    const performance = await workforceService.listPerformance(req.user.warehouseKey, params);
    res.status(200).json(performance);
  } catch (error) {
    next(error);
  }
};

/**
 * Get incentive criteria
 */
const getIncentiveCriteria = async (req, res, next) => {
  try {
    const result = {
      productivity: { min: 80, target: 100 },
      accuracy: { min: 95, target: 98 },
      attendance: { min: 90, target: 100 },
    };
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStaffSummary,
  listStaff,
  listShifts,
  createShift,
  getShiftById,
  updateShift,
  getShiftCoverage,
  getWeeklyRoster,
  publishWeeklyRoster,
  listAbsences,
  logAbsence,
  autoAssignShifts,
  getStaffPerformance,
  getIncentiveCriteria,
};

