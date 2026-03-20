const mongoose = require('mongoose');

const ClusterSchema = new mongoose.Schema({
  clusterId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  orderIds: [{
    type: String,
    required: true,
  }],
  center: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  status: {
    type: String,
    enum: ['active', 'assigned', 'completed', 'cancelled'],
    default: 'active',
    index: true,
  },
  riderId: {
    type: String,
    default: null,
    index: true,
  },
  color: {
    type: String,
    default: '#F97316',
  },
  zone: {
    type: String,
    default: null,
    index: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  }
}, {
  timestamps: true,
  collection: 'clusters',
});

// Indexes for common queries
ClusterSchema.index({ status: 1, zone: 1 });
ClusterSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Cluster || mongoose.model('Cluster', ClusterSchema);
