/**
 * Shift Management controller – Dashboard CRUD and roster.
 */
const shiftManagementService = require('../services/shiftManagement.service');
const { success, error } = require('../utils/response.util');

const list = async (req, res, next) => {
  try {
    const { site, siteId, status } = req.query;
    const data = await shiftManagementService.listShifts({ site, siteId, status });
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await shiftManagementService.createShift(req.body);
    success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await shiftManagementService.updateShift(req.params.id, req.body);
    if (!data) return res.status(404).json({ success: false, message: 'Shift not found' });
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const getRoster = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date().toISOString().split('T')[0];
    const end = endDate || start;
    const data = await shiftManagementService.getRoster(start, end);
    success(res, { roster: data });
  } catch (err) {
    next(err);
  }
};

const listPickers = async (req, res, next) => {
  try {
    const data = await shiftManagementService.listActivePickers();
    success(res, data);
  } catch (err) {
    next(err);
  }
};

const assign = async (req, res, next) => {
  try {
    const { pickerId, date } = req.body;
    if (!pickerId || !date) {
      return res.status(400).json({ success: false, message: 'pickerId and date are required' });
    }
    const result = await shiftManagementService.assignPicker(req.params.id, pickerId, date);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }
    success(res, { message: result.message || 'Picker assigned' });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, getRoster, listPickers, assign };
