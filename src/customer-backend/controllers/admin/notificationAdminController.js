const { Notification } = require('../../models/Notification');
const { CustomerUser } = require('../../models/CustomerUser');

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

exports.send = async (req, res) => {
  try {
    const { title, body, data, audience, userIds } = req.body;
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
      return res.status(400).json({ success: false, error: 'Specify audience="all" or audience="specific" with userIds array' });
    }

    const notifications = targetUserIds.map((uid) => ({
      userId: uid,
      title,
      body: body || '',
      data: data || {},
      read: false,
    }));

    const result = await Notification.insertMany(notifications);
    res.status(201).json({ success: true, sent: result.length });
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
      Notification.countDocuments(),
      Notification.countDocuments({ read: false }),
    ]);
    const recentByDay = await Notification.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);
    res.json({ success: true, data: { total, unread, read: total - unread, recentByDay } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
