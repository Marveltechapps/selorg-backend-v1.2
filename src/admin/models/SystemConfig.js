/**
 * System Configuration - key-value store for platform settings
 * Sections: general, delivery, notifications, tax, advanced
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const SystemConfigSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });

SystemConfigSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.models.SystemConfig || mongoose.model('SystemConfig', SystemConfigSchema);
