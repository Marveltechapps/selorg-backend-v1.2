const { Notification } = require('../../models/Notification');
const { CustomerUser } = require('../../models/CustomerUser');
const { sendNotification } = require('../../services/unifiedNotificationService');
const { resolveCategory } = require('../../constants/notificationCategories');

exports.list = async (req, res) => {
  try {
    const { userId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Notification.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Admin blast — routes through unified pipeline (prefs + all channels).
 * Body: { title, body, data, audience: 'all'|'specific', userIds?, channels?, category? }
 */
exports.send = async (req, res) => {
  try {
    const { title, body, data, audience, userIds, channels, category } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    let targetUserIds = [];

    if (audience === 'all') {
      const users = await CustomerUser.find({ status: 'active' }).select('_id').lean();
      targetUserIds = users.map((u) => u._id);
    } else if (audience === 'specific' && Array.isArray(userIds) && userIds.length > 0) {
      targetUserIds = userIds;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Specify audience="all" or audience="specific" with userIds array',
      });
    }

    const resolvedCategory = resolveCategory(
      data?.type || 'SYSTEM_ANNOUNCEMENT',
      category || data?.category
    );

    let sent = 0;
    let skipped = 0;
    for (const uid of targetUserIds) {
      const result = await sendNotification({
        userId: uid,
        title,
        body: body || '',
        type: data?.type || 'SYSTEM_ANNOUNCEMENT',
        category: resolvedCategory,
        data: data || {},
        channels,
      });
      if (result.skipped) skipped += 1;
      else if (result.success) sent += 1;
    }

    res.status(201).json({ success: true, sent, skipped, total: targetUserIds.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await Notification.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.stats = async (req, res) => {
  try {
    const [total, unread] = await Promise.all([
      Notification.countDocuments({ suppressed: { $ne: true } }),
      Notification.countDocuments({ read: false, suppressed: { $ne: true } }),
    ]);
    const recentByDay = await Notification.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);
    res.json({ success: true, data: { total, unread, read: total - unread, recentByDay } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
