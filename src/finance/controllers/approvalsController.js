const approvalsService = require('../services/approvalsService');
const { asyncHandler } = require('../../core/middleware');
const cacheInvalidation = require('../cacheInvalidation');

class ApprovalsController {
  getApprovalSummary = asyncHandler(async (req, res) => {
    const summary = await approvalsService.getApprovalSummary();
    res.json({ success: true, data: summary });
  });

  getApprovalTasks = asyncHandler(async (req, res) => {
    const { status, type, minAmount } = req.query;
    const tasks = await approvalsService.getApprovalTasks(status, type, minAmount ? parseFloat(minAmount) : undefined);
    res.json({ success: true, data: tasks });
  });

  getTaskDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const task = await approvalsService.getTaskDetails(id);
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }
    res.json({ success: true, data: task });
  });

  submitTaskDecision = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const task = await approvalsService.submitTaskDecision(id, req.body);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: task });
  });
}

module.exports = new ApprovalsController();

