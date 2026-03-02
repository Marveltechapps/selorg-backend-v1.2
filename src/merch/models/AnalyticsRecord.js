const mongoose = require('mongoose');
const { Schema } = mongoose;

const AnalyticsRecordSchema = new Schema({
  type: { type: String, enum: ['campaign', 'sku', 'regional'], required: true },
  entityId: { type: String, required: true },
  entityName: { type: String, required: true },
  metricDate: { type: String, required: true },
  revenue: { type: Number, default: 0 },
  orders: { type: Number, default: 0 },
  uplift: { type: Number },
  roi: { type: Number },
  unitsSold: { type: Number },
  aov: { type: Number },
  redemptionRate: { type: Number },
  metadata: { type: Schema.Types.Mixed }
}, {
  timestamps: true
});

// Compound index for efficient querying
AnalyticsRecordSchema.index({ type: 1, metricDate: 1 });
AnalyticsRecordSchema.index({ entityId: 1, type: 1 });

module.exports = mongoose.models.AnalyticsRecord || mongoose.model('AnalyticsRecord', AnalyticsRecordSchema);
