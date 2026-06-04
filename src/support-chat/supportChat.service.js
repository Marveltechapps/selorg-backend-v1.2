const { randomUUID } = require('crypto');
const SupportConversation = require('./models/SupportConversation');
const SupportMessage = require('./models/SupportMessage');
const { emitSupportRealtime } = require('./supportChat.socket');

let RiderModel = null;
function getRiderModel() {
  if (!RiderModel) {
    try {
      RiderModel = require('../rider_v2_backend/src/models/Rider').Rider;
    } catch {
      RiderModel = null;
    }
  }
  return RiderModel;
}

function toConversationDto(doc) {
  if (!doc) return null;
  return {
    conversationId: doc.conversationId,
    riderId: doc.riderId,
    riderName: doc.riderName,
    riderPhone: doc.riderPhone,
    status: doc.status,
    lastMessage: doc.lastMessage || '',
    lastMessageAt: doc.lastMessageAt,
    riderUnreadCount: doc.riderUnreadCount || 0,
    adminUnreadCount: doc.adminUnreadCount || 0,
    resolvedAt: doc.resolvedAt,
    resolvedBy: doc.resolvedBy,
    updatedAt: doc.updatedAt,
  };
}

function toMessageDto(doc) {
  return {
    messageId: doc.messageId,
    conversationId: doc.conversationId,
    senderType: doc.senderType,
    senderId: doc.senderId,
    senderName: doc.senderName,
    body: doc.body,
    clientMessageId: doc.clientMessageId,
    createdAt: doc.createdAt,
    readByRider: doc.readByRider,
    readByAdmin: doc.readByAdmin,
  };
}

async function resolveRiderProfile(riderId) {
  const Rider = getRiderModel();
  if (!Rider) return { name: 'Rider', phone: '' };
  const rider = await Rider.findOne({ riderId }).lean();
  return {
    name: rider?.name || 'Rider',
    phone: rider?.phoneNumber || '',
  };
}

async function getOrCreateConversationForRider(riderId) {
  let conversation = await SupportConversation.findOne({ riderId }).lean();
  if (conversation) return conversation;

  const profile = await resolveRiderProfile(riderId);
  const created = await SupportConversation.create({
    conversationId: `sc-${randomUUID()}`,
    riderId,
    riderName: profile.name,
    riderPhone: profile.phone,
    status: 'open',
    lastMessage: '',
    lastMessageAt: null,
    riderUnreadCount: 0,
    adminUnreadCount: 0,
  });
  return created.toObject();
}

async function listConversationsForAdmin({ search, status, unreadOnly } = {}) {
  const query = {};
  if (status) query.status = status;
  if (unreadOnly) query.adminUnreadCount = { $gt: 0 };

  if (search && String(search).trim()) {
    const term = String(search).trim();
    const digits = term.replace(/\D/g, '');
    const or = [
      { riderName: { $regex: term, $options: 'i' } },
      { riderId: { $regex: term, $options: 'i' } },
    ];
    if (digits.length >= 4) {
      or.push({ riderPhone: { $regex: digits, $options: 'i' } });
    }
    query.$or = or;
  }

  const rows = await SupportConversation.find(query)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(200)
    .lean();

  return rows.map(toConversationDto);
}

async function getConversationById(conversationId) {
  const doc = await SupportConversation.findOne({ conversationId }).lean();
  return toConversationDto(doc);
}

async function assertRiderOwnsConversation(conversationId, riderId) {
  const doc = await SupportConversation.findOne({ conversationId }).lean();
  if (!doc) throw new Error('Conversation not found');
  if (doc.riderId !== riderId) throw new Error('Access denied');
  return doc;
}

async function listMessages(conversationId, { limit = 50, before } = {}) {
  const q = { conversationId };
  if (before) q.createdAt = { $lt: new Date(before) };

  const rows = await SupportMessage.find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();

  return rows.reverse().map(toMessageDto);
}

async function sendMessage({
  conversationId,
  senderType,
  senderId,
  senderName,
  body,
  clientMessageId,
}) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Message body is required');

  if (clientMessageId) {
    const existing = await SupportMessage.findOne({ conversationId, clientMessageId }).lean();
    if (existing) {
      const conversation = await SupportConversation.findOne({ conversationId }).lean();
      return { conversation: toConversationDto(conversation), message: toMessageDto(existing), duplicate: true };
    }
  }

  const message = await SupportMessage.create({
    messageId: `sm-${randomUUID()}`,
    conversationId,
    senderType,
    senderId,
    senderName: senderName || (senderType === 'admin' ? 'Support' : 'Rider'),
    body: text,
    clientMessageId: clientMessageId || null,
    readByRider: senderType === 'rider',
    readByAdmin: senderType === 'admin',
  });

  const inc = {
    lastMessage: text,
    lastMessageAt: new Date(),
  };
  const update = { $set: inc };
  if (senderType === 'rider') {
    update.$inc = { adminUnreadCount: 1 };
  } else {
    update.$inc = { riderUnreadCount: 1 };
  }

  const conversation = await SupportConversation.findOneAndUpdate(
    { conversationId },
    update,
    { new: true }
  ).lean();

  emitSupportRealtime(conversation, message.toObject());

  return {
    conversation: toConversationDto(conversation),
    message: toMessageDto(message.toObject()),
    duplicate: false,
  };
}

async function markRead(conversationId, readerType) {
  const isRider = readerType === 'rider';
  const filter = { conversationId };
  const set = isRider ? { readByRider: true } : { readByAdmin: true };
  const unreadField = isRider ? 'readByRider' : 'readByAdmin';

  await SupportMessage.updateMany({ ...filter, [unreadField]: false }, { $set: set });

  const convUpdate = isRider
    ? { $set: { riderUnreadCount: 0 } }
    : { $set: { adminUnreadCount: 0 } };

  const conversation = await SupportConversation.findOneAndUpdate(
    { conversationId },
    convUpdate,
    { new: true }
  ).lean();

  if (conversation) emitSupportRealtime(conversation, null);
  return toConversationDto(conversation);
}

async function updateStatus(conversationId, status, adminUserId) {
  const update = {
    status,
    resolvedAt: status === 'resolved' ? new Date() : null,
    resolvedBy: status === 'resolved' ? adminUserId || 'admin' : null,
  };
  if (status === 'open') {
    update.resolvedAt = null;
    update.resolvedBy = null;
  }

  const conversation = await SupportConversation.findOneAndUpdate(
    { conversationId },
    { $set: update },
    { new: true }
  ).lean();

  if (conversation) emitSupportRealtime(conversation, null);
  return toConversationDto(conversation);
}

module.exports = {
  getOrCreateConversationForRider,
  listConversationsForAdmin,
  getConversationById,
  assertRiderOwnsConversation,
  listMessages,
  sendMessage,
  markRead,
  updateStatus,
  toConversationDto,
  toMessageDto,
};
