const mongoose = require('mongoose');
const { asyncHandler } = require('../../core/middleware');
const riderDashboardNotificationService = require('../services/riderDashboardNotificationService');

const riderDashboardNotificationController = {
  list: asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50);
    const userId = req.user?.userId || '';
    const scopeKey = riderDashboardNotificationService.resolveScopeKey(req);
    const data = await riderDashboardNotificationService.listForUser(scopeKey, userId, { limit });
    res.status(200).json({ success: true, data });
  }),

  markRead: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification id' });
    }
    const scopeKey = riderDashboardNotificationService.resolveScopeKey(req);
    await riderDashboardNotificationService.markRead(scopeKey, id, req.user?.userId || '');
    res.status(200).json({ success: true });
  }),

  markAllRead: asyncHandler(async (req, res) => {
    const scopeKey = riderDashboardNotificationService.resolveScopeKey(req);
    await riderDashboardNotificationService.markAllRead(scopeKey, req.user?.userId || '');
    res.status(200).json({ success: true });
  }),
};

module.exports = riderDashboardNotificationController;
