const mongoose = require('mongoose');

const financeSummarySchema = new mongoose.Schema({
  entityId: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true },
  totalReceivedToday: { type: Number, required: true, default: 0 },
  totalReceivedChangePercent: { type: Number, required: true, default: 0 },
  pendingSettlementsAmount: { type: Number, required: true, default: 0 },
  pendingSettlementsGateways: { type: Number, required: true, default: 0 },
  vendorPayoutsAmount: { type: Number, required: true, default: 0 },
  vendorPayoutsStatusText: { type: String, required: true },
  failedPaymentsRatePercent: { type: Number, required: true, default: 0 },
  failedPaymentsCount: { type: Number, required: true, default: 0 },
  failedPaymentsThresholdPercent: { type: Number, required: true, default: 1.0 },
}, {
  timestamps: true,
});

financeSummarySchema.index({ entityId: 1, date: -1 });

module.exports = mongoose.models.FinanceSummary || mongoose.model('FinanceSummary', financeSummarySchema);

