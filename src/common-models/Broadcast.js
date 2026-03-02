const mongoose = require('mongoose');

const BroadcastSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  recipients: {
    type: [String],
    required: true,
  },
  priority: {
    type: String,
    enum: ['normal', 'high', 'urgent'],
    default: 'normal',
  },
  status: {
    type: String,
    enum: ['sent', 'pending', 'failed'],
    default: 'pending',
    index: true,
  },
  sentCount: {
    type: Number,
    default: 0,
  },
  failedCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  collection: 'broadcasts',
});

BroadcastSchema.index({ status: 1, createdAt: -1 });

const Broadcast = mongoose.model('Broadcast', BroadcastSchema);

module.exports = Broadcast;

