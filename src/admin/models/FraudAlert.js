const mongoose = require('mongoose');
const { Schema } = mongoose;

const FraudEvidenceSchema = new Schema({
  type: { type: String, enum: ['transaction', 'device', 'behavior', 'system', 'manual'] },
  description: String,
  timestamp: Date,
  data: Schema.Types.Mixed,
}, { _id: true });

const FraudAlertSchema = new Schema({
  alertNumber: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['promo_abuse', 'fake_account', 'payment_fraud', 'velocity_breach', 'device_fraud', 'refund_abuse', 'chargeback_risk'],
    required: true,
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'false_positive'],
    default: 'open',
  },
  customerId: { type: String, required: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  description: { type: String, required: true },
  riskScore: { type: Number, required: true },
  evidence: [FraudEvidenceSchema],
  actions: [String],
  orderNumbers: [String],
  amountInvolved: Number,
  deviceId: String,
  ipAddress: String,
  location: String,
  assignedTo: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  resolvedAt: Date,
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
}, { timestamps: true });

FraudAlertSchema.index({ status: 1 });
FraudAlertSchema.index({ severity: 1 });
FraudAlertSchema.index({ type: 1 });
FraudAlertSchema.index({ createdAt: -1 });

const FraudAlert = mongoose.models.FraudAlert || mongoose.model('FraudAlert', FraudAlertSchema);
module.exports = FraudAlert;
