const mongoose = require('mongoose');

const ApprovalRequestSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['order_exception', 'vehicle_request', 'document_approval', 'other'],
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  reason: {
    type: String,
    default: null,
    trim: true,
    maxlength: 500,
  },
  requestedBy: {
    type: String,
    required: true,
    trim: true,
  },
  requestedById: {
    type: String,
    required: true,
  },
  requesterRole: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  approvedBy: {
    type: String,
    default: null,
  },
  approvedById: {
    type: String,
    default: null,
  },
  approvedAt: {
    type: Date,
    default: null,
  },
  rejectionReason: {
    type: String,
    default: null,
    trim: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
  collection: 'approval_requests',
});

ApprovalRequestSchema.index({ status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ type: 1, status: 1 });
ApprovalRequestSchema.index({ requestedById: 1 });

const ApprovalRequest = mongoose.models.ApprovalRequest || mongoose.model('ApprovalRequest', ApprovalRequestSchema);

module.exports = ApprovalRequest;

