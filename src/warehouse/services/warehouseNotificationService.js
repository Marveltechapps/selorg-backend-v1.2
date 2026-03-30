const WarehouseNotification = require('../models/WarehouseNotification');
const { invalidateWarehouse } = require('../cacheInvalidation');
const { mergeWarehouseFilter, warehouseFieldsForCreate, warehouseKeyMatch } = require('../constants/warehouseScope');

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

async function createEntry(warehouseKey, { title, body, category = 'system', refType, refId }) {
  const doc = await WarehouseNotification.create({
    title,
    body: body || '',
    category,
    refType,
    refId,
    ...warehouseFieldsForCreate(warehouseKey),
  });
  invalidateWarehouse().catch(() => {});
  return doc;
}

async function listForUser(warehouseKey, userId, { limit = 30 } = {}) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
  const docs = await WarehouseNotification.find(warehouseKeyMatch(warehouseKey))
    .sort({ createdAt: -1 })
    .limit(cap)
    .lean();
  const uid = userId || '';
  return docs.map((d) => toFeedDto(d, uid));
}

async function markRead(warehouseKey, notificationId, userId) {
  if (!userId) return;
  await WarehouseNotification.updateOne(
    mergeWarehouseFilter({ _id: notificationId }, warehouseKey),
    { $addToSet: { readByUserIds: userId } }
  );
  invalidateWarehouse().catch(() => {});
}

async function markAllRead(warehouseKey, userId) {
  if (!userId) return;
  await WarehouseNotification.updateMany(warehouseKeyMatch(warehouseKey), { $addToSet: { readByUserIds: userId } });
  invalidateWarehouse().catch(() => {});
}

function notifyGrnCreated(warehouseKey, grn) {
  const title = `GRN ${grn.id} received`;
  const body = `${grn.vendor} – PO ${grn.poNumber}${grn.items != null ? ` – ${grn.items} line items` : ''}`;
  return createEntry(warehouseKey, {
    title,
    body,
    category: 'inbound',
    refType: 'grn',
    refId: grn.id,
  });
}

function notifyGrnCompleted(warehouseKey, grn) {
  return createEntry(warehouseKey, {
    title: `GRN ${grn.id} completed`,
    body: `Receiving closed for PO ${grn.poNumber}`,
    category: 'inbound',
    refType: 'grn',
    refId: grn.id,
  });
}

function notifyGrnDiscrepancy(warehouseKey, grn) {
  const detail = grn.discrepancyNotes || grn.discrepancyType || 'Count mismatch logged';
  return createEntry(warehouseKey, {
    title: `GRN ${grn.id} discrepancy`,
    body: detail,
    category: 'inbound',
    refType: 'grn',
    refId: grn.id,
  });
}

module.exports = {
  createEntry,
  listForUser,
  markRead,
  markAllRead,
  notifyGrnCreated,
  notifyGrnCompleted,
  notifyGrnDiscrepancy,
};
