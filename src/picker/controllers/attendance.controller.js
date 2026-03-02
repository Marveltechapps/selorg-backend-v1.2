/**
 * Attendance controller – from backend-workflow.yaml (attendance_summary).
 */
const attendanceService = require('../services/attendance.service');
const { success } = require('../utils/response.util');

const getSummary = async (req, res, next) => {
  try {
    const { month, year } = req.query || {};
    const data = await attendanceService.getSummary(req.userId, month, year);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const getStats = async (req, res, next) => {
  try {
    const data = await attendanceService.getStats(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getSummary, getStats };
