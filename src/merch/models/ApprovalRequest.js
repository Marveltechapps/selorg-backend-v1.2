const mongoose = require('mongoose');
const { Schema } = mongoose;

const ApprovalRequestSchema = new Schema({
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  requestedBy: { type: String, required: true },
  requestedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Expired'], default: 'Pending' },
  riskLevel: { type: String, enum: ['Low', 'Medium', 'High'], required: true },
  region: { type: String, required: true },
  details: { type: Schema.Types.Mixed, required: true },
  approvers: [{ type: String }],
  currentStep: { type: Number, default: 1 },
  slaDeadline: { type: Date, required: true },
  comments: [{
    user: { type: String },
    text: { type: String },
    timestamp: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Indexes for performance
ApprovalRequestSchema.index({ status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ type: 1, status: 1 });
ApprovalRequestSchema.index({ riskLevel: 1, status: 1 });
ApprovalRequestSchema.index({ requestedBy: 1 });

module.exports = mongoose.models.ApprovalRequest || mongoose.model('ApprovalRequest', ApprovalRequestSchema);
