/**
 * Admin Picker Approvals Controller
 * Workforce approval workflow for picker users.
 */
const pickerApprovalsService = require('../services/pickerApprovals.service');
const { getLogsByPicker, getAllLogs } = require('../../picker/services/pickerActionLog.service');
const logger = require('../../core/utils/logger');

/**
 * GET /admin/pickers - List pickers with filters
 */
async function listPickers(req, res, next) {
  try {
    const { status, page, limit } = req.query;
    const result = await pickerApprovalsService.listPickers({
      status: status || 'all',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Admin picker list failed', { error: err.message });
    next(err);
  }
}

/**
 * GET /admin/pickers/:id - Get full picker profile
 */
async function getPickerById(req, res, next) {
  try {
    const { id } = req.params;
    const picker = await pickerApprovalsService.getPickerById(id);
    if (!picker) {
      return res.status(404).json({
        success: false,
        error: { message: 'Picker not found' },
      });
    }
    res.json({ success: true, data: picker });
  } catch (err) {
    logger.error('Admin picker get failed', { error: err.message });
    next(err);
  }
}

/**
 * PATCH /admin/pickers/:id - Update picker status
 * Body: { status: 'ACTIVE'|'REJECTED'|'BLOCKED'|'PENDING', rejectedReason?: string }
 */
async function updatePickerStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, rejectedReason } = req.body;
    if (!status) {
      return res.status(400).json({
        success: false,
        error: { message: 'status is required' },
      });
    }
    if (status === 'REJECTED' && !rejectedReason) {
      return res.status(400).json({
        success: false,
        error: { message: 'rejectedReason is required when status is REJECTED' },
      });
    }
    const approvedBy = req.user?.userId || req.user?.id;
    const picker = await pickerApprovalsService.updatePickerStatus(id, { status, rejectedReason }, approvedBy);
    if (!picker) {
      return res.status(404).json({
        success: false,
        error: { message: 'Picker not found' },
      });
    }
    res.json({ success: true, data: picker });
  } catch (err) {
    logger.error('Admin picker update failed', { error: err.message });
    next(err);
  }
}

/**
 * GET /admin/pickers/:id/action-logs - Get picker action logs (audit)
 * Query: startDate, endDate, actionType, limit
 * RBAC: admin, super_admin
 */
async function getPickerActionLogs(req, res, next) {
  try {
    const { id } = req.params;
    const { startDate, endDate, actionType, limit } = req.query;
    const logs = await getLogsByPicker(id, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      actionType: actionType || undefined,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    logger.error('Admin picker action logs failed', { error: err.message });
    next(err);
  }
}

/**
 * GET /admin/picker-action-logs - List all picker action logs (audit)
 * Query: pickerId, orderId, actionType, startDate, endDate, page, limit
 * RBAC: admin, super_admin
 */
async function listAllPickerActionLogs(req, res, next) {
  try {
    const { pickerId, orderId, actionType, startDate, endDate, page, limit } = req.query;
    const result = await getAllLogs({
      pickerId: pickerId || undefined,
      orderId: orderId || undefined,
      actionType: actionType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Admin list picker action logs failed', { error: err.message });
    next(err);
  }
}

module.exports = {
  listPickers,
  getPickerById,
  updatePickerStatus,
  getPickerActionLogs,
  listAllPickerActionLogs,
};
