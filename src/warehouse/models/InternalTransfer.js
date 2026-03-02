const mongoose = require('mongoose');

const InternalTransferSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  transferId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  fromLocation: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  toLocation: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  sku: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  productName: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'in-transit', 'completed'],
    default: 'pending',
    index: true,
  },
  initiatedBy: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'internal_transfers',
});

// Indexes for performance
InternalTransferSchema.index({ status: 1, timestamp: -1 });
InternalTransferSchema.index({ sku: 1, status: 1 });
InternalTransferSchema.index({ fromLocation: 1, toLocation: 1 });


module.exports = mongoose.models.InternalTransfer || mongoose.model('InternalTransfer', InternalTransferSchema);

