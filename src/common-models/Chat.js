const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  participantId: {
    type: String,
    required: true,
    index: true,
  },
  participantName: {
    type: String,
    required: true,
    trim: true,
  },
  participantType: {
    type: String,
    required: true,
    enum: ['Rider', 'TeamLead', 'Dispatch', 'Customer', 'SupportAgent', 'Other'],
    index: true,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  relatedOrderId: {
    type: String,
    default: null,
    index: true,
  },
  lastMessage: {
    type: String,
    default: null,
  },
  lastMessageTime: {
    type: Date,
    default: null,
  },
  unreadCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  collection: 'chats',
});

ChatSchema.index({ participantId: 1, participantType: 1 });
ChatSchema.index({ lastMessageTime: -1 });

const Chat = mongoose.model('Chat', ChatSchema);

module.exports = Chat;

