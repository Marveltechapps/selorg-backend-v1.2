const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  chatId: {
    type: String,
    required: true,
    index: true,
  },
  senderId: {
    type: String,
    required: true,
  },
  senderName: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  direction: {
    type: String,
    required: true,
    enum: ['incoming', 'outgoing'],
  },
  read: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
  collection: 'messages',
});

MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });

const Message = mongoose.model('Message', MessageSchema);

module.exports = Message;

