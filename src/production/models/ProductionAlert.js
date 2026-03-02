const mongoose = require('mongoose');

const productionAlertSchema = new mongoose.Schema(
  {
    alert_id: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['critical', 'warning', 'info'],
      default: 'warning',
    },
    category: {
      type: String,
      required: true,
      enum: ['equipment', 'material', 'quality', 'safety', 'shift', 'production'],
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'acknowledged', 'resolved', 'dismissed'],
      default: 'active',
    },
    location: { type: String },
    assigned_to: { type: String },
    resolved_by: { type: String },
    resolved_at: { type: Date },
    factory_id: {
      type: String,
      required: true,
      default: () => process.env.DEFAULT_FACTORY_ID || 'FAC-Austin-01',
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

productionAlertSchema.index({ factory_id: 1, status: 1 });
productionAlertSchema.index({ factory_id: 1, severity: 1 });
productionAlertSchema.index({ factory_id: 1, category: 1 });
productionAlertSchema.index({ alert_id: 1 });

module.exports = mongoose.models.ProductionAlert || mongoose.model('ProductionAlert', productionAlertSchema);
