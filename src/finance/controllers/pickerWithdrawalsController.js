/**
 * Finance Picker Withdrawals controller – list, details, patch (approve/reject/mark_paid).
 */
const pickerWithdrawalsService = require('../services/pickerWithdrawalsService');

async function list(req, res, next) {
  try {
    const { status, page, limit } = req.query;
    const result = await pickerWithdrawalsService.list({
      status: status === 'all' ? undefined : status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getDetails(req, res, next) {
  try {
    const details = await pickerWithdrawalsService.getDetails(req.params.id);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Withdrawal request not found' });
    }
    res.json({ success: true, data: details });
  } catch (err) {
    next(err);
  }
}

async function updateAction(req, res, next) {
  try {
    const { action } = req.body || {};
    if (!action || !['approve', 'reject', 'mark_paid'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action. Use approve, reject, or mark_paid' });
    }
    if (action === 'reject' && !req.body.rejectedReason) {
      return res.status(400).json({ success: false, error: 'rejectedReason is required when rejecting' });
    }
    const approverId = req.user?.id || req.user?._id;
    const result = await pickerWithdrawalsService.updateAction(req.params.id, action, req.body, approverId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    const updated = await pickerWithdrawalsService.getDetails(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getDetails, updateAction };
