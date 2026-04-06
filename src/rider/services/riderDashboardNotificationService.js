const RiderDashboardNotification = require('../models/RiderDashboardNotification');

function scopeMatch(scopeKey) {
  const key = scopeKey && String(scopeKey).trim() ? String(scopeKey).trim() : 'global';
  return { scopeKey: key };
}

function mergeScopeFilter(scopeKey, extra = {}) {
  return { ...scopeMatch(scopeKey), ...extra };
}

/**
 * @param {import('express').Request} req
 */
function resolveScopeKey(req) {
  const u = req.user || {};
  const fromHub = u.hubKey && String(u.hubKey).trim();
  const fromWh = u.warehouseKey && String(u.warehouseKey).trim();
  const fromPrimary = u.primaryStoreId && String(u.primaryStoreId).trim();
  const fromAssigned = Array.isArray(u.assignedStores) && u.assignedStores[0] && String(u.assignedStores[0]).trim();
  return fromHub || fromWh || fromPrimary || fromAssigned || 'global';
}

function toFeedDto(doc, userId) {
  const read = (doc.readByUserIds || []).includes(userId);
  const created = doc.createdAt;
  return {
    id: doc._id.toString(),
    userId: '',
    userName: '',
    templateName: doc.category,
    title: doc.title,
    body: doc.body || '',
    channel: doc.channel || 'in-app',
    status: read ? 'opened' : 'delivered',
    sentAt: created instanceof Date ? created.toISOString() : created,
  };
}

async function createEntry(scopeKey, { title, body, category = 'system', refType, refId }) {
  const key = scopeKey && String(scopeKey).trim() ? String(scopeKey).trim() : 'global';
  return RiderDashboardNotification.create({
    scopeKey: key,
    title,
    body: body || '',
    category,
    refType,
    refId,
  });
}

async function listForUser(scopeKey, userId, { limit = 30 } = {}) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
  const key = scopeKey && String(scopeKey).trim() ? String(scopeKey).trim() : 'global';
  const docs = await RiderDashboardNotification.find(scopeMatch(key))
    .sort({ createdAt: -1 })
    .limit(cap)
    .lean();
  const uid = userId || '';
  return docs.map((d) => toFeedDto(d, uid));
}

async function markRead(scopeKey, notificationId, userId) {
  if (!userId) return;
  const key = scopeKey && String(scopeKey).trim() ? String(scopeKey).trim() : 'global';
  await RiderDashboardNotification.updateOne(
    mergeScopeFilter(key, { _id: notificationId }),
    { $addToSet: { readByUserIds: userId } }
  );
}

async function markAllRead(scopeKey, userId) {
  if (!userId) return;
  const key = scopeKey && String(scopeKey).trim() ? String(scopeKey).trim() : 'global';
  await RiderDashboardNotification.updateMany(scopeMatch(key), { $addToSet: { readByUserIds: userId } });
}

function notifyOrderAssigned(req, { orderId, riderName }) {
  const scopeKey = resolveScopeKey(req);
  const name = riderName ? String(riderName) : 'Rider';
  return createEntry(scopeKey, {
    title: `Order ${orderId} assigned`,
    body: `${name} is assigned to this delivery.`,
    category: 'dispatch',
    refType: 'order',
    refId: String(orderId),
  });
}

function notifyOrderAlert(req, { orderId, reason }) {
  const scopeKey = resolveScopeKey(req);
  return createEntry(scopeKey, {
    title: `Alert: order ${orderId}`,
    body: String(reason || 'Operational alert'),
    category: 'alert',
    refType: 'order',
    refId: String(orderId),
  });
}

module.exports = {
  resolveScopeKey,
  createEntry,
  listForUser,
  markRead,
  markAllRead,
  notifyOrderAssigned,
  notifyOrderAlert,
};
