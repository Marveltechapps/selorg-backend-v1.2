const mongoose = require('mongoose');

const TimelineEventSchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
    enum: ['assigned', 'picked_up', 'in_transit', 'delivered', 'rto', 'returned', 'delayed', 'pending'],
  },
  time: {
    type: Date,
    required: true,
    default: Date.now,
  },
  note: {
    type: String,
    default: null,
  },
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    match: /^ORD-\d+$/,
    index: true,
  },
  order_id: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    required: true,
    enum: ['assigned', 'picked_up', 'in_transit', 'delivered', 'rto', 'returned', 'delayed', 'pending'],
    default: 'pending',
    index: true,
  },
  riderId: {
    type: String,
    default: null,
    match: /^RIDER-\d+$/,
    index: true,
  },
  etaMinutes: {
    type: Number,
    default: null,
    min: 0,
  },
  slaDeadline: {
    type: Date,
    required: true,
    index: true,
  },
  pickupLocation: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true,
  },
  dropLocation: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true,
  },
  zone: {
    type: String,
    default: null,
    trim: true,
    index: true,
  },
  customerName: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
    index: true,
  },
  items: {
    type: [String],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Order must have at least one item',
    },
  },
  timeline: {
    type: [TimelineEventSchema],
    required: true,
    default: [],
  },
  completedAt: {
    type: Date,
    default: null,
  },
  deliveryTimeSeconds: {
    type: Number,
    default: null,
    min: 0,
  },
}, {
  timestamps: true,
  collection: 'orders',
});

// Ensure timeline is sorted by time
OrderSchema.pre('save', function(next) {
  if (this.timeline && this.timeline.length > 0) {
    this.timeline.sort((a, b) => a.time - b.time);
  }
  next();
});

// Indexes for performance
OrderSchema.index({ status: 1, slaDeadline: 1 });
OrderSchema.index({ riderId: 1, status: 1 });
OrderSchema.index({ zone: 1, status: 1 }); // For zone-based queries
OrderSchema.index({ customerName: 'text' });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 }); // For status-based time queries


module.exports = mongoose.models.WarehouseOrder || mongoose.model('WarehouseOrder', OrderSchema);

