/**
 * Shifts controller – from backend-workflow.yaml (shifts_available, shifts_select, shift_start, shift_end).
 */
const shiftsService = require('../services/shifts.service');
const { success, error } = require('../utils/response.util');

const getAvailable = async (req, res, next) => {
  try {
    const data = await shiftsService.getAvailable(req.userId);
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

module.exports = { getAvailable, select, start, end };
