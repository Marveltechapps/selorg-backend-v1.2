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
}, {
  timestamps: true,
});

reconciliationRunSchema.index({ status: 1, startedAt: -1 });

module.exports = mongoose.models.ReconciliationRun || mongoose.model('ReconciliationRun', reconciliationRunSchema);

