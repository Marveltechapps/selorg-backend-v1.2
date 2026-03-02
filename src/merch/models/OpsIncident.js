const mongoose = require('mongoose');
const { Schema } = mongoose;

const timelineEventSchema = new Schema({
  timestamp: { type: Date, required: true },
  event: { type: String, required: true },
}, { _id: false });

const incidentActionSchema = new Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['primary', 'secondary', 'danger'], default: 'secondary' },
}, { _id: false });

const OpsIncidentSchema = new Schema({
  incidentNumber: { type: String, required: true, unique: true, index: true },
  type: {
    type: String,
    enum: ['store_outage', 'payment_gateway', 'maps_api', 'warehouse', 'rider_shortage'],
    required: true,
  },
  severity: {
    type: String,
    enum: ['critical', 'warning', 'stable'],
    required: true,
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  startTime: { type: Date, required: true, default: Date.now },
  resolvedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ['ongoing', 'resolved'],
    default: 'ongoing',
    index: true,
  },
  impact: { type: String, default: null },
  affectedOrders: { type: Number, default: null },
  affectedCustomers: { type: Number, default: null },
  storeId: { type: String, default: null },
  storeName: { type: String, default: null },
  outageReason: { type: String, default: null },
  estimatedResolution: { type: Date, default: null },
  actionsTaken: { type: String, default: null },
  integrationType: { type: String, default: null },
  integrationName: { type: String, default: null },
  timeline: [timelineEventSchema],
  actions: [incidentActionSchema],
  cityId: { type: String, default: 'default', index: true },
}, {
  timestamps: true,
  collection: 'ops_incidents',
});

OpsIncidentSchema.index({ status: 1, type: 1 });
OpsIncidentSchema.index({ severity: 1 });
OpsIncidentSchema.index({ startTime: -1 });

module.exports = mongoose.models.OpsIncident || mongoose.model('OpsIncident', OpsIncidentSchema);
