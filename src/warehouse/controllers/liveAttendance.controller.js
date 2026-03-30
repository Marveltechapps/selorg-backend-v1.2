/**
 * Live Attendance controller – serves GET /warehouse/attendance/live
 */
const liveAttendanceService = require('../services/liveAttendance.service');
const { asyncHandler } = require('../../core/middleware');

const getLive = asyncHandler(async (req, res) => {
  const { date, site } = req.query || {};
  const rows = await liveAttendanceService.getLiveAttendance(req.user.warehouseKey, { date, site });
  res.status(200).json({ success: true, data: rows });
});

module.exports = { getLive };
