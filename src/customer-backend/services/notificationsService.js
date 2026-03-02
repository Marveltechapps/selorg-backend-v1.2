const mongoose = require('mongoose');
const { Notification } = require('../models/Notification');

function toResponse(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    title: o.title,
    body: o.body,
    read: Boolean(o.read),
    data: o.data || {},
    createdAt: o.createdAt,
  };
}

async function listByUserId(userId, page = 1, limit = 50) {
  const skip = (Math.max(1, page) - 1) * limit;
  const [list, total] = await Promise.all([
    Notification.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId: new mongoose.Types.ObjectId(userId) }),
  ]);
  return {
    data: list.map(toResponse),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

async function markRead(userId, notificationId) {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: new mongoose.Types.ObjectId(userId) },
    { $set: { read: true } },
    { new: true }
  ).lean();
  return updated ? toResponse(updated) : null;
}

async function markAllRead(userId) {
  await Notification.updateMany(
    { userId: new mongoose.Types.ObjectId(userId), read: false },
    { $set: { read: true } }
  );
  return { success: true };
}

module.exports = { listByUserId, markRead, markAllRead };
