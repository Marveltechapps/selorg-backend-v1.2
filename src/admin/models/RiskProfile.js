const mongoose = require('mongoose');
const { Schema } = mongoose;

const RiskFactorSchema = new Schema({
  name: String,
  score: Number,
  weight: Number,
  description: String,
}, { _id: false });

const RiskProfileSchema = new Schema({
  entityType: { type: String, enum: ['customer', 'device', 'ip', 'transaction'], required: true },
  entityId: { type: String, required: true },
  entityName: { type: String, required: true },
  riskScore: { type: Number, required: true },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  factors: [RiskFactorSchema],
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  refundRate: { type: Number, default: 0 },
  chargebackCount: { type: Number, default: 0 },
  accountAge: { type: Number, default: 0 },
  lastActivity: Date,
  flags: [String],
}, { timestamps: true });

RiskProfileSchema.index({ riskLevel: 1 });
RiskProfileSchema.index({ entityId: 1 });

const RiskProfile = mongoose.models.RiskProfile || mongoose.model('RiskProfile', RiskProfileSchema);
module.exports = RiskProfile;
