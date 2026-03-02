const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
  lat: {
    type: Number,
    required: true,
  },
  lng: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    required: true,
  },
}, { _id: false });

const DeviceHealthSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  riderId: {
    type: String,
    default: null,
    index: true,
  },
  riderName: {
    type: String,
    default: null,
    trim: true,
  },
  appVersion: {
    type: String,
    required: true,
  },
  isLatestVersion: {
    type: Boolean,
    default: true,
  },
  batteryLevel: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  signalStrength: {
    type: String,
    required: true,
    enum: ['Strong', 'Moderate', 'Weak', 'None'],
  },
  lastSync: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['Healthy', 'Attention', 'Critical', 'Offline'],
    default: 'Healthy',
    index: true,
  },
  issues: {
    type: [String],
    default: [],
  },
  location: {
    type: LocationSchema,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'device_health',
});

DeviceHealthSchema.index({ riderId: 1, status: 1 });
DeviceHealthSchema.index({ status: 1, lastSync: -1 });

const DeviceHealth = mongoose.model('DeviceHealth', DeviceHealthSchema);

module.exports = DeviceHealth;

