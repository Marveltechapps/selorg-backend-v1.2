const mongoose = require('mongoose');
const { asyncHandler } = require('../../core/middleware');
const warehouseNotificationService = require('../services/warehouseNotificationService');

const warehouseNotificationController = {
  list: asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50);
    const userId = req.user?.userId || '';
    const data = await warehouseNotificationService.listForUser(req.user.warehouseKey, userId, { limit });
    res.status(200).json({ success: true, data });
  }),

  markRead: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification id' });
    }
    await warehouseNotificationService.markRead(req.user.warehouseKey, id, req.user?.userId || '');
    res.status(200).json({ success: true });
  }),

  markAllRead: asyncHandler(async (req, res) => {
    await warehouseNotificationService.markAllRead(req.user.warehouseKey, req.user?.userId || '');
    res.status(200).json({ success: true });
  }),
};

module.exports = warehouseNotificationController;
