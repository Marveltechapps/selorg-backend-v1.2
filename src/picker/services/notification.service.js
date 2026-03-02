/**
 * Notification service – from backend-workflow.yaml (notifications_list, mark_read, mark_all_read).
 * REAL-TIME: default empty list if DB slow/down; never block.
 */
const Notification = require('../models/notification.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const emptyResult = { data: [], pagination: { page: 1, limit: 20, total: 0 } };

const list = async (userId, query = {}) => {
  try {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    const [items, total] = await withTimeout(
      Promise.all([
        Notification.find({ userId }).lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        Notification.countDocuments({ userId }),
      ]),
      DB_TIMEOUT_MS,
      [[], 0]
    );
    const list_ = (items || []).map((n) => ({
      id: n._id.toString(),
      type: n.type,
      title: n.title,
      description: n.description,
      timestamp: n.createdAt,
      isRead: n.isRead ?? false,
    }));
    return { data: list_, pagination: { page, limit, total: total ?? 0 } };
  } catch (err) {
    console.warn('[notification] list fallback:', err?.message);
    return emptyResult;
  }
};

const markRead = async (userId, id) => {
  try {
    const doc = await withTimeout(
      Notification.findOneAndUpdate(
        { _id: id, userId },
        { $set: { isRead: true } },
        { new: true }
      ),
      DB_TIMEOUT_MS
    );
    return !!doc;
  } catch (err) {
    console.warn('[notification] markRead fallback:', err?.message);
    return false;
  }
};

const markAllRead = async (userId) => {
  try {
    await withTimeout(Notification.updateMany({ userId }, { $set: { isRead: true } }), DB_TIMEOUT_MS);
    return true;
  } catch (err) {
    console.warn('[notification] markAllRead fallback:', err?.message);
    return true;
  }
};

module.exports = { list, markRead, markAllRead };
