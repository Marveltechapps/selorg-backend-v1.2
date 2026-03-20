const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
  lat: {
    type: Number,
    required: true,
    min: -90,
    max: 90,
  },
  lng: {
    type: Number,
    required: true,
    min: -180,
    max: 180,
  },
}, { _id: false });

const CapacitySchema = new mongoose.Schema({
  currentLoad: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  maxLoad: {
    type: Number,
    required: true,
    min: 1,
    default: 5,
  },
}, { _id: false });

const RiderSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    match: /^(RIDER-\d+|RDR-[A-Z0-9]+-\d{4}-\d+)$/,
    index: true,
  },
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
  },
  avatarInitials: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 3,
    uppercase: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['online', 'offline', 'busy', 'idle'],
    default: 'offline',
    index: true,
  },
  currentOrderId: {
    type: String,
    default: null,
    match: /^ORD-[\d-]+$/, // Match warehouse Order id format (e.g. ORD-20260312-00072)
  },
  location: {
    type: LocationSchema,
    default: null,
  },
  capacity: {
    type: CapacitySchema,
    required: true,
  },
  avgEtaMins: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  rating: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
    default: 0,
  },
  zone: {
    type: String,
    default: null,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'riders',
  id: false, // Disable automatic id virtual to avoid conflict with our 'id' field
});

// Validation: currentLoad cannot exceed maxLoad
RiderSchema.pre('save', function(next) {
  if (this.capacity.currentLoad > this.capacity.maxLoad) {
    return next(new Error('Current load cannot exceed max load'));
  }
  next();
});

// Indexes for performance
RiderSchema.index({ status: 1, zone: 1 });
RiderSchema.index({ name: 'text' });


module.exports = mongoose.models.RiderOperational || mongoose.model('RiderOperational', RiderSchema);

