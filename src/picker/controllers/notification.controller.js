/**
 * Notification controller – from backend-workflow.yaml (notifications_list, mark_read, mark_all_read).
 */
const notificationService = require('../services/notification.service');
const { success, error } = require('../utils/response.util');

const list = async (req, res, next) => {
  try {
    const result = await notificationService.list(req.userId, req.query);
    success(res, result.data);
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    const ok = await notificationService.markRead(req.userId, req.params.id);
    if (!ok) return error(res, 'Not found', 404);
    success(res, {});
  } catch (err) {
    next(err);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    await notificationService.markAllRead(req.userId);
    success(res, {});
  } catch (err) {
    next(err);
  }
};

module.exports = { list, markRead, markAllRead };
