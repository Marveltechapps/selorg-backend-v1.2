const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema(
  {
    incident_id: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['hazard', 'accident', 'damage', 'maintenance'],
    },
    location: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    reported_by: {
      type: String,
      required: true,
    },
    reported_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      required: true,
      enum: ['open', 'resolved'],
      default: 'open',
    },
    resolved_at: {
      type: Date,
      required: false,
    },
    resolved_by: {
      type: String,
      required: false,
    },
    priority: {
      type: String,
      required: false,
    },
    resolution_notes: {
      type: String,
      required: false,
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

incidentSchema.index({ store_id: 1, status: 1 });
incidentSchema.index({ store_id: 1, type: 1 });
incidentSchema.index({ incident_id: 1 });

module.exports = mongoose.models.Incident || mongoose.model('Incident', incidentSchema);

