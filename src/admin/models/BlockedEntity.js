const mongoose = require('mongoose');
const { Schema } = mongoose;

const BlockedEntitySchema = new Schema({
  type: { type: String, enum: ['email', 'phone', 'ip', 'device', 'user'], required: true },
  value: { type: String, required: true },
  reason: { type: String, required: true },
  blockedBy: { type: String, required: true },
  blockedByName: { type: String, required: true },
  expiresAt: Date,
  isPermanent: { type: Boolean, default: false },
  relatedAlerts: [String],
  notes: String,
}, { timestamps: true });

BlockedEntitySchema.index({ type: 1, value: 1 }, { unique: true });
BlockedEntitySchema.index({ createdAt: -1 });

const BlockedEntity = mongoose.models.BlockedEntity || mongoose.model('BlockedEntity', BlockedEntitySchema);
module.exports = BlockedEntity;
