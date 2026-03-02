const mongoose = require('mongoose');
const { Schema } = mongoose;

const FraudPatternSchema = new Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['promo_abuse', 'account_takeover', 'payment_fraud', 'refund_fraud', 'velocity_abuse'],
    required: true,
  },
  description: String,
  occurrences: { type: Number, default: 0 },
  totalLoss: { type: Number, default: 0 },
  detectedCount: { type: Number, default: 0 },
  preventedCount: { type: Number, default: 0 },
  trend: { type: String, enum: ['increasing', 'decreasing', 'stable'], default: 'stable' },
  lastDetected: Date,
  affectedCustomers: { type: Number, default: 0 },
}, { timestamps: true });

const FraudPattern = mongoose.models.FraudPattern || mongoose.model('FraudPattern', FraudPatternSchema);
module.exports = FraudPattern;
