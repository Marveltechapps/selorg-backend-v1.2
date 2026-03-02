const workflowAutomationService = require('../services/workflowAutomationService');
const { asyncHandler } = require('../../core/middleware');

/**
 * Workflow Automation Controller
 */

/**
 * @route   POST /api/v1/shared/automation/rules
 * @desc    Create automation rule
 * @access  Private
 */
const createRule = asyncHandler(async (req, res) => {
  const rule = req.body;

  if (!rule.name || !rule.event_type || !rule.conditions || !rule.actions) {
    return res.status(400).json({
      success: false,
      error: 'name, event_type, conditions, and actions are required',
    });
  }

  const result = await workflowAutomationService.createRule(rule);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * @route   POST /api/v1/shared/automation/trigger
 * @desc    Trigger automation
 * @access  Private
 */
const triggerAutomation = asyncHandler(async (req, res) => {
  const { eventType, eventData } = req.body;

  if (!eventType || !eventData) {
    return res.status(400).json({
      success: false,
      error: 'eventType and eventData are required',
    });
  }

  const results = await workflowAutomationService.triggerAutomation(eventType, eventData);

  res.status(200).json({
    success: true,
    data: results,
  });
});

/**
 * @route   POST /api/v1/shared/automation/schedule
 * @desc    Schedule automation task
 * @access  Private
 */
const scheduleTask = asyncHandler(async (req, res) => {
  const task = req.body;

  if (!task.name || !task.schedule || !task.action) {
    return res.status(400).json({
      success: false,
      error: 'name, schedule, and action are required',
    });
  }

  const result = await workflowAutomationService.scheduleTask(task);

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * @route   GET /api/v1/shared/automation/rules
 * @desc    Get all automation rules
 * @access  Private
 */
const getRules = asyncHandler(async (req, res) => {
  // In a real implementation, fetch from database
  // For now, return empty array
  res.status(200).json({
    success: true,
    data: [],
  });
});

module.exports = {
  createRule,
  triggerAutomation,
  scheduleTask,
  getRules,
};
