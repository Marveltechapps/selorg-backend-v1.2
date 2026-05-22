const mongoose = require('mongoose');

const reconciliationRunSchema = new mongoose.Schema({
  startedAt: { type: Date, required: true, default: Date.now, index: true },
  finishedAt: { type: Date },
  status: { 
    type: String, 
    required: true, 
    enum: ['running', 'success', 'failed'],
    index: true 
  },
  period: {
    from: { type: Date, required: true },
    to: { type: Date, required: true },
  },
  gateways: [{ type: String }],
  stats: {
    transactionsChecked: { type: Number, default: 0 },
    matchedAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    mismatchAmount: { type: Number, default: 0 },
    exceptionsCreated: { type: Number, default: 0 },
    exceptionsUpdated: { type: Number, default: 0 },
  },
  errorMessage: { type: String },
}, {
  timestamps: true,
});

reconciliationRunSchema.index({ status: 1, startedAt: -1 });

module.exports = mongoose.models.ReconciliationRun || mongoose.model('ReconciliationRun', reconciliationRunSchema);

