const mongoose = require('mongoose');

const SuspensionDetailsSchema = new mongoose.Schema({
  isSuspended: {
    type: Boolean,
    required: true,
    default: false,
  },
  reason: {
    type: String,
    default: null,
  },
  since: {
    type: Date,
    default: null,
  },
  durationDays: {
    type: Number,
    default: null,
    min: 1,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
}, { _id: false });

const PolicyViolationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  violationType: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  occurredAt: {
    type: Date,
    required: true,
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high'],
  },
}, { _id: false });

const ComplianceSchema = new mongoose.Schema({
  riderId: {
    type: String,
    required: true,
    unique: true,
    match: /^RIDER-\d+$/,
    index: true,
  },
  riderName: {
    type: String,
    required: true,
  },
  isCompliant: {
    type: Boolean,
    required: true,
    default: true,
    index: true,
  },
  lastAuditDate: {
    type: Date,
    required: true,
  },
  policyViolationsCount: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  lastViolationReason: {
    type: String,
    default: null,
  },
  suspension: {
    type: SuspensionDetailsSchema,
    default: null,
  },
  violations: {
    type: [PolicyViolationSchema],
    default: [],
  },
}, {
  timestamps: true,
  collection: 'compliance',
});

// Indexes
ComplianceSchema.index({ isCompliant: 1 });
ComplianceSchema.index({ 'suspension.isSuspended': 1 });
ComplianceSchema.index({ lastAuditDate: -1 });

// Create and export the model
const Compliance = mongoose.model('Compliance', ComplianceSchema);

module.exports = Compliance;

