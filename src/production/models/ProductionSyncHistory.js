const mongoose = require('mongoose');

const productionSyncHistorySchema = new mongoose.Schema(
  {
    sync_id: { type: String, required: true, unique: true },
    factory_id: { type: String, required: true },
    device_count: { type: Number, default: 0 },
    status: { type: String, enum: ['success', 'failed'], default: 'success' },
    duration_seconds: { type: Number },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

productionSyncHistorySchema.index({ factory_id: 1, created_at: -1 });

module.exports = mongoose.models.ProductionSyncHistory || mongoose.model('ProductionSyncHistory', productionSyncHistorySchema);
