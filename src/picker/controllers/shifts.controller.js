/**
 * Shifts controller – from backend-workflow.yaml (shifts_available, shifts_select, shift_start, shift_end).
 * radiusKm from query or picker config (dashboard-managed).
 */
const shiftsService = require('../services/shifts.service');
const pickerConfigService = require('../services/pickerConfig.service');
const { success, error } = require('../utils/response.util');

const getAvailable = async (req, res, next) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat) : null;
    const lng = req.query.lng ? parseFloat(req.query.lng) : null;
    let radiusKm = req.query.radiusKm ? parseFloat(req.query.radiusKm) : null;
    if (radiusKm == null || isNaN(radiusKm)) {
      radiusKm = await pickerConfigService.getShiftGeoRadiusKm();
    }
    const data = await shiftsService.getAvailable(req.userId, { lat, lng, radiusKm });
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const select = async (req, res, next) => {
  try {
    await shiftsService.selectShifts(req.userId, req.body.selectedShifts);
    success(res, {});
  } catch (err) {
    next(err);
  }
};

const start = async (req, res, next) => {
  try {
    const result = await shiftsService.start(req.userId, req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    success(res, { shiftStartTime: result.shiftStartTime });
  } catch (err) {
    next(err);
  }
};

const end = async (req, res, next) => {
  try {
    const result = await shiftsService.end(req.userId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    success(res, {});
  } catch (err) {
    next(err);
  }
};

const startBreak = async (req, res, next) => {
  try {
    const result = await shiftsService.startBreak(req.userId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    success(res, {});
  } catch (err) {
    next(err);
  }
};

const endBreak = async (req, res, next) => {
  try {
    const result = await shiftsService.endBreak(req.userId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    success(res, {});
  } catch (err) {
    next(err);
  }
};

module.exports = { getAvailable, select, start, end, startBreak, endBreak };
