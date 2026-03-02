const mongoose = require('mongoose');

const DiagnosticsFindingSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['error', 'warning', 'info'],
  },
  severity: {
    type: String,
    required: true,
    enum: ['critical', 'high', 'medium', 'low'],
  },
  message: {
    type: String,
    required: true,
  },
  deviceId: {
    type: String,
    default: null,
  },
  recommendation: {
    type: String,
    default: null,
  },
}, { _id: false });

const DiagnosticsSummarySchema = new mongoose.Schema({
  totalChecks: {
    type: Number,
    default: 0,
  },
  passed: {
    type: Number,
    default: 0,
  },
  failed: {
    type: Number,
    default: 0,
  },
  warnings: {
    type: Number,
    default: 0,
  },
}, { _id: false });

const DiagnosticsReportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['completed', 'in_progress', 'failed'],
    default: 'in_progress',
    index: true,
  },
  scope: {
    type: String,
    enum: ['full', 'devices', 'connectivity', 'performance'],
    default: 'full',
  },
  findings: {
    type: [DiagnosticsFindingSchema],
    required: true,
    default: [],
  },
  summary: {
    type: DiagnosticsSummarySchema,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'diagnostics_reports',
});

DiagnosticsReportSchema.index({ status: 1, createdAt: -1 });

const DiagnosticsReport = mongoose.model('DiagnosticsReport', DiagnosticsReportSchema);

module.exports = DiagnosticsReport;

