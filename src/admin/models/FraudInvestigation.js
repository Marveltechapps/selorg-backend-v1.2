const mongoose = require('mongoose');
const { Schema } = mongoose;

const InvestigationTimelineSchema = new Schema({
  action: String,
  performedBy: Schema.Types.ObjectId,
  performedByName: String,
  timestamp: Date,
  details: String,
}, { _id: true });

const FraudInvestigationSchema = new Schema({
  caseNumber: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['fraud', 'abuse', 'suspicious'], default: 'fraud' },
  status: {
    type: String,
    enum: ['open', 'investigating', 'pending_review', 'closed'],
    default: 'open',
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  investigator: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  customerId: String,
  customerName: String,
  totalLoss: { type: Number, default: 0 },
  timeline: [InvestigationTimelineSchema],
  outcome: { type: String, enum: ['confirmed_fraud', 'false_positive', 'inconclusive'] },
  closedAt: Date,
}, { timestamps: true });

FraudInvestigationSchema.index({ status: 1 });
FraudInvestigationSchema.index({ openedAt: -1 });

const FraudInvestigation = mongoose.models.FraudInvestigation || mongoose.model('FraudInvestigation', FraudInvestigationSchema);
module.exports = FraudInvestigation;
