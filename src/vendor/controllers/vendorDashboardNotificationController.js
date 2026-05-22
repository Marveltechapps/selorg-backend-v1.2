const mongoose = require('mongoose');
const { asyncHandler } = require('../../core/middleware');
const vendorDashboardNotificationService = require('../services/vendorDashboardNotificationService');
const { resolveHubKeyFromUserDoc } = require('../constants/hubScope');

function resolveHubKey(req) {
  return req.vendorHubKey || resolveHubKeyFromUserDoc(req.user);
}

const vendorDashboardNotificationController = {
  list: asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50);
    const hubKey = resolveHubKey(req);
    const userId = req.user?.userId || req.user?.id || req.user?._id || '';
    const data = await vendorDashboardNotificationService.listForUser(hubKey, String(userId), { limit });
    res.status(200).json({ success: true, data });
  }),

  markRead: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification id' });
    }
    const hubKey = resolveHubKey(req);
    const userId = req.user?.userId || req.user?.id || req.user?._id || '';
    await vendorDashboardNotificationService.markRead(hubKey, id, String(userId));
    res.status(200).json({ success: true });
  }),

  markAllRead: asyncHandler(async (req, res) => {
    const hubKey = resolveHubKey(req);
    const userId = req.user?.userId || req.user?.id || req.user?._id || '';
    await vendorDashboardNotificationService.markAllRead(hubKey, String(userId));
    res.status(200).json({ success: true });
  }),
};

module.exports = vendorDashboardNotificationController;
