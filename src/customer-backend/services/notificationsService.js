const mongoose = require('mongoose');
const { Notification } = require('../models/Notification');
const { CATEGORY_LIST } = require('../constants/notificationCategories');

const INBOX_FILTER = { suppressed: { $ne: true } };

function toResponse(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    title: o.title,
    body: o.body,
    read: Boolean(o.read),
    category: o.category || o.data?.category || 'system',
    data: o.data || {},
    createdAt: o.createdAt,
    deliveryStatus: o.deliveryStatus,
  };
}

async function listByUserId(userId, page = 1, limit = 50, { category, unreadOnly } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  const userFilter = {
    userId: new mongoose.Types.ObjectId(userId),
    ...INBOX_FILTER,
  };
  if (category && CATEGORY_LIST.includes(category)) {
    userFilter.category = category;
  }
  if (unreadOnly) {
    userFilter.read = false;
  }
  const [list, total, unread] = await Promise.all([
    Notification.find(userFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(userFilter),
    Notification.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      ...INBOX_FILTER,
      read: false,
    }),
  ]);
  return {
    data: list.map(toResponse),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    unreadCount: unread,
  };
}

async function markRead(userId, notificationId) {
  const updated = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      userId: new mongoose.Types.ObjectId(userId),
      ...INBOX_FILTER,
    },
    { $set: { read: true } },
    { new: true }
  ).lean();
  return updated ? toResponse(updated) : null;
}

async function markUnread(userId, notificationId) {
  const updated = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      userId: new mongoose.Types.ObjectId(userId),
      ...INBOX_FILTER,
    },
    { $set: { read: false } },
    { new: true }
  ).lean();
  return updated ? toResponse(updated) : null;
}

async function markAllRead(userId) {
  await Notification.updateMany(
    {
      userId: new mongoose.Types.ObjectId(userId),
      read: false,
      ...INBOX_FILTER,
    },
    { $set: { read: true } }
  );
  return { success: true };
}

async function removeOne(userId, notificationId) {
  const deleted = await Notification.findOneAndDelete({
    _id: notificationId,
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();
  return deleted ? toResponse(deleted) : null;
}

async function getUnreadCount(userId) {
  return Notification.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    ...INBOX_FILTER,
    read: false,
  });
}

module.exports = {
  listByUserId,
  markRead,
  markUnread,
  markAllRead,
  removeOne,
  getUnreadCount,
};
