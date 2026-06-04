const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const SupportConversationSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `sc-${randomUUID()}`,
    },
    riderId: { type: String, required: true, unique: true, index: true },
    riderName: { type: String, default: 'Rider' },
    riderPhone: { type: String, default: '' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null, index: true },
    riderUnreadCount: { type: Number, default: 0 },
    adminUnreadCount: { type: Number, default: 0 },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
  },
  { timestamps: true, collection: 'support_conversations' }
);

module.exports =
  mongoose.models.SupportConversation ||
  mongoose.model('SupportConversation', SupportConversationSchema);
