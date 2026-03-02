const mongoose = require('mongoose');

const productionSettingsSchema = new mongoose.Schema(
  {
    factory_id: { type: String, required: true, unique: true },
    auto_sync: { type: Boolean, default: true },
    sync_interval_minutes: { type: Number, default: 15 },
    auto_backup: { type: Boolean, default: true },
    backup_interval: { type: String, enum: ['hourly', 'daily', 'weekly'], default: 'daily' },
    email_notifications: { type: Boolean, default: true },
    alert_threshold: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

productionSettingsSchema.index({ factory_id: 1 });

module.exports = mongoose.models.ProductionSettings || mongoose.model('ProductionSettings', productionSettingsSchema);
