const mongoose = require('mongoose');

const productionIncidentSchema = new mongoose.Schema(
  {
    incident_id: {
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
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    category: {
      type: String,
      required: false,
      default: 'General',
    },
    reported_by: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      default: 'Not specified',
    },
    status: {
      type: String,
      required: true,
      enum: ['open', 'investigating', 'resolved'],
      default: 'open',
    },
    factory_id: {
      type: String,
      required: true,
      default: () => process.env.DEFAULT_FACTORY_ID || 'FAC-Austin-01',
    },
    reported_at: { type: Date, default: Date.now },
    resolved_at: { type: Date },
    resolved_by: { type: String },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

productionIncidentSchema.index({ factory_id: 1, status: 1 });
productionIncidentSchema.index({ incident_id: 1 });

module.exports = mongoose.models.ProductionIncident || mongoose.model('ProductionIncident', productionIncidentSchema);
