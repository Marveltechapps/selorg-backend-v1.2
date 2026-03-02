const procurementApprovalsService = require('../services/procurementApprovalsService');

async function getSummary(req, res, next) {
  try {
    const summary = await procurementApprovalsService.getSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function listTasks(req, res, next) {
  try {
    const filters = {
      status: req.query.status || 'pending',
      type: req.query.type,
      minValue: req.query.minValue ? parseFloat(req.query.minValue) : undefined,
    };
    const tasks = await procurementApprovalsService.listTasks(filters);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
}

async function getTaskById(req, res, next) {
  try {
    const task = await procurementApprovalsService.getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (err) {
    next(err);
  }
}

async function submitDecision(req, res, next) {
  try {
    const payload = req.body;
    if (!payload || (payload.decision !== 'approve' && payload.decision !== 'reject')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'decision must be "approve" or "reject"',
      });
    }
    if (payload.decision === 'reject' && !payload.reason) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'reason is required when rejecting',
      });
    }
    const userId = req.user?.id || req.user?._id || req.user?.userId || 'system';
    const task = await procurementApprovalsService.submitDecision(req.params.id, payload, userId);
    res.json(task);
  } catch (err) {
    if (err.message === 'Task not found') {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (err.message === 'Task has already been processed') {
      return res.status(400).json({ error: 'Task has already been processed' });
    }
    next(err);
  }
}

module.exports = {
  getSummary,
  listTasks,
  getTaskById,
  submitDecision,
};
