/**
 * Notification model – from backend-workflow.yaml (notifications collection).
 */
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['payout', 'order', 'shift', 'training', 'milestone', 'bonus', 'update'] },
    title: { type: String, required: true },
    description: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
