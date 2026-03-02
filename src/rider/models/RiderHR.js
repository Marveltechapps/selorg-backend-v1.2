const mongoose = require('mongoose');

const ContractSchema = new mongoose.Schema({
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  renewalDue: {
    type: Boolean,
    required: true,
    default: false,
  },
}, { _id: false });

const ComplianceSchema = new mongoose.Schema({
  isCompliant: {
    type: Boolean,
    required: true,
    default: true,
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
}, { _id: false });

const SuspensionSchema = new mongoose.Schema({
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
}, { _id: false });

const RiderHRSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    match: /^RIDER-\d+$/,
    index: true,
  },
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    match: /^\+[1-9]\d{1,14}$/,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  status: {
    type: String,
    required: true,
    enum: ['onboarding', 'active', 'suspended'],
    default: 'onboarding',
    index: true,
  },
  onboardingStatus: {
    type: String,
    required: true,
    enum: ['invited', 'docs_pending', 'under_review', 'approved'],
    default: 'invited',
    index: true,
  },
  trainingStatus: {
    type: String,
    required: true,
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'not_started',
  },
  appAccess: {
    type: String,
    required: true,
    enum: ['enabled', 'disabled'],
    default: 'disabled',
  },
  deviceAssigned: {
    type: Boolean,
    required: true,
    default: false,
  },
  deviceId: {
    type: String,
    default: null,
  },
  deviceType: {
    type: String,
    default: null,
  },
  contract: {
    type: ContractSchema,
    required: true,
  },
  compliance: {
    type: ComplianceSchema,
    required: true,
  },
  suspension: {
    type: SuspensionSchema,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'riders_hr',
});

// Indexes
RiderHRSchema.index({ status: 1, onboardingStatus: 1 });
RiderHRSchema.index({ trainingStatus: 1 });
RiderHRSchema.index({ appAccess: 1 });
RiderHRSchema.index({ 'compliance.isCompliant': 1 });
RiderHRSchema.index({ name: 'text', email: 'text' });

// Create and export the model
const RiderHR = mongoose.model('RiderHR', RiderHRSchema);

module.exports = RiderHR;

