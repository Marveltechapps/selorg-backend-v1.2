const VendorDashboardNotification = require('../models/VendorDashboardNotification');
const { hubKeyMatchForKey, hubFieldsForCreate, getEffectiveHubKey } = require('../constants/hubScope');

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

function scopeMatch(hubKey) {
  return hubKeyMatchForKey(hubKey || getEffectiveHubKey());
}

function mergeScopeFilter(hubKey, extra = {}) {
  return { ...scopeMatch(hubKey), ...extra };
}

async function createEntry(hubKey, { title, body, category = 'system', refType, refId }) {
  const doc = await VendorDashboardNotification.create({
    title,
    body: body || '',
    category,
    refType,
    refId,
    hubKey: hubKey && String(hubKey).trim() ? String(hubKey).trim() : getEffectiveHubKey(),
  });
  return doc;
}

async function listForUser(hubKey, userId, { limit = 30 } = {}) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
  const key = hubKey && String(hubKey).trim() ? String(hubKey).trim() : getEffectiveHubKey();
  const docs = await VendorDashboardNotification.find(scopeMatch(key))
    .sort({ createdAt: -1 })
    .limit(cap)
    .lean();
  const uid = userId || '';
  return docs.map((d) => toFeedDto(d, uid));
}

async function markRead(hubKey, notificationId, userId) {
  if (!userId) return;
  const key = hubKey && String(hubKey).trim() ? String(hubKey).trim() : getEffectiveHubKey();
  await VendorDashboardNotification.updateOne(
    mergeScopeFilter(key, { _id: notificationId }),
    { $addToSet: { readByUserIds: userId } }
  );
}

async function markAllRead(hubKey, userId) {
  if (!userId) return;
  const key = hubKey && String(hubKey).trim() ? String(hubKey).trim() : getEffectiveHubKey();
  await VendorDashboardNotification.updateMany(scopeMatch(key), { $addToSet: { readByUserIds: userId } });
}

module.exports = {
  createEntry,
  listForUser,
  markRead,
  markAllRead,
  hubFieldsForCreate,
};
