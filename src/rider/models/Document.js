const mongoose = require('mongoose');

const ApprovalHistorySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  riderId: {
    type: String,
    required: true,
  },
  riderName: {
    type: String,
    required: true,
  },
  documentType: {
    type: String,
    required: true,
    enum: ['ID Proof', 'Driving License', 'Vehicle RC', 'Insurance Policy', 'Background Check', 'Contract'],
  },
  action: {
    type: String,
    required: true,
    enum: ['approved', 'rejected'],
  },
  actionBy: {
    type: String,
    required: true,
  },
  actionAt: {
    type: Date,
    required: true,
  },
  notes: {
    type: String,
    default: null,
  },
}, { _id: false });

const DocumentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    match: /^DOC-\d+$/,
    index: true,
  },
  riderId: {
    type: String,
    required: true,
    match: /^RIDER-\d+$/,
    index: true,
  },
  riderName: {
    type: String,
    required: true,
  },
  documentType: {
    type: String,
    required: true,
    enum: ['ID Proof', 'Driving License', 'Vehicle RC', 'Insurance Policy', 'Background Check', 'Contract'],
    index: true,
  },
  submittedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'approved', 'rejected', 'expired', 'resubmitted'],
    default: 'pending',
    index: true,
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  reviewer: {
    type: String,
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  approvalHistory: {
    type: [ApprovalHistorySchema],
    default: [],
  },
}, {
  timestamps: true,
  collection: 'documents',
});

// Indexes
DocumentSchema.index({ riderId: 1, status: 1 });
DocumentSchema.index({ status: 1, submittedAt: -1 });
DocumentSchema.index({ documentType: 1, status: 1 });
DocumentSchema.index({ expiresAt: 1 }, { sparse: true });

// Auto-update status to expired if expiresAt is in the past
DocumentSchema.pre('save', function(next) {
  if (this.expiresAt && new Date() > this.expiresAt && this.status !== 'expired') {
    this.status = 'expired';
  }
  next();
});

// Create and export the model
const Document = mongoose.model('Document', DocumentSchema);

module.exports = Document;

