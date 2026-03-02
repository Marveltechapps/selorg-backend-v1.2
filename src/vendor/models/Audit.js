const mongoose = require('mongoose');

const AuditSchema = new mongoose.Schema(
  {
    vendorId: { type: String, required: true, index: true },
    auditId: { type: String, unique: true, required: true },
    auditType: { 
      type: String, 
      enum: ['Routine', 'Follow-up', 'Full Audit', 'Spot Check'],
      default: 'Routine',
      index: true,
    },
    date: { type: Date, required: true, index: true },
    result: { 
      type: String, 
      enum: ['Passed', 'Failed', 'Pending'],
      default: 'Pending',
      index: true,
    },
    score: { type: Number, min: 0, max: 100 },
    inspectorId: String,
    inspectorName: String,
    findings: [{
      category: String,
      description: String,
      severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
      status: { type: String, enum: ['open', 'resolved'] },
    }],
    recommendations: [String],
    attachments: [String],
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

AuditSchema.index({ vendorId: 1, date: -1 });
AuditSchema.index({ auditType: 1, result: 1 });

module.exports = mongoose.models.Audit || mongoose.model('Audit', AuditSchema);
