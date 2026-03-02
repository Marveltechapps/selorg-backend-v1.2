const mongoose = require('mongoose');

const financeAlertSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true, 
    enum: ['gateway_failure_rate', 'high_value_txn', 'settlement_mismatch', 'sla_breach', 'risk_fraud', 'other'],
    index: true 
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  severity: { 
    type: String, 
    required: true, 
    enum: ['critical', 'high', 'medium', 'low'],
    index: true 
  },
  status: { 
    type: String, 
    required: true, 
    enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed'],
    index: true 
  },
  source: {
    gateway: { type: String },
    txnId: { type: String },
    batchId: { type: String },
    metrics: {
      failureRatePercent: { type: Number },
      thresholdPercent: { type: Number },
      amount: { type: Number },
    },
  },
  suggestedActions: [{ type: String }],
  lastUpdatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

financeAlertSchema.index({ status: 1, createdAt: -1 });
financeAlertSchema.index({ severity: 1, status: 1 });

module.exports = mongoose.models.FinanceAlert || mongoose.model('FinanceAlert', financeAlertSchema);

