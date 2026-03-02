const mongoose = require('mongoose');

const AlertTimelineEntrySchema = new mongoose.Schema({
  at: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
  note: {
    type: String,
    default: null,
  },
  actor: {
    type: String,
    default: null,
  },
}, { _id: false });

const AlertSourceSchema = new mongoose.Schema({
  orderId: {
    type: String,
    default: null,
  },
  riderId: {
    type: String,
    default: null,
  },
  riderName: {
    type: String,
    default: null,
  },
  vehicleId: {
    type: String,
    default: null,
  },
  zone: {
    type: String,
    default: null,
  },
  lat: {
    type: Number,
    default: null,
  },
  lng: {
    type: Number,
    default: null,
  },
}, { _id: false, strict: false });

const AlertSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['sla_breach', 'delayed_delivery', 'rider_no_show', 'zone_deviation', 'vehicle_breakdown', 'rto_return', 'other'],
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  priority: {
    type: String,
    required: true,
    enum: ['critical', 'high', 'medium', 'low'],
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed'],
    default: 'open',
    index: true,
  },
  lastUpdatedAt: {
    type: Date,
    default: function() {
      return this.createdAt || new Date();
    },
  },
  source: {
    type: AlertSourceSchema,
    required: true,
  },
  actionsSuggested: {
    type: [String],
    required: true,
    enum: ['notify_customer', 'reassign_rider', 'call_rider', 'mark_offline', 'view_location', 'add_note', 'resolve', 'acknowledge'],
  },
  timeline: {
    type: [AlertTimelineEntrySchema],
    required: true,
    default: [],
  },
}, {
  timestamps: true,
  collection: 'alerts',
});

// Indexes for performance
AlertSchema.index({ status: 1, priority: 1 });
AlertSchema.index({ type: 1, status: 1 });
AlertSchema.index({ 'source.orderId': 1 });
AlertSchema.index({ 'source.riderId': 1 });
AlertSchema.index({ createdAt: -1 });

const Alert = mongoose.models.Alert || mongoose.model('Alert', AlertSchema);

module.exports = Alert;

