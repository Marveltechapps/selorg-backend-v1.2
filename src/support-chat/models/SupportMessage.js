const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const SupportMessageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `sm-${randomUUID()}`,
    },
    conversationId: { type: String, required: true, index: true },
    senderType: { type: String, enum: ['rider', 'admin'], required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, default: '' },
    body: { type: String, required: true, trim: true },
    clientMessageId: { type: String, default: null },
    readByRider: { type: Boolean, default: false },
    readByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'support_messages' }
);

SupportMessageSchema.index(
  { conversationId: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $type: 'string' } } }
);

module.exports =
  mongoose.models.SupportMessage ||
  mongoose.model('SupportMessage', SupportMessageSchema);
