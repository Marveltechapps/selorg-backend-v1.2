const mongoose = require('mongoose');
const { Schema } = mongoose;

const FraudRuleSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['velocity', 'amount', 'device', 'location', 'behavior'], required: true },
  condition: { type: String, required: true },
  threshold: { type: Number, required: true },
  action: { type: String, enum: ['flag', 'block', 'review', 'alert'], required: true },
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 1 },
  triggeredCount: { type: Number, default: 0 },
  falsePositiveRate: { type: Number, default: 0 },
  lastTriggered: Date,
}, { timestamps: true });

FraudRuleSchema.index({ isActive: 1 });

const FraudRule = mongoose.models.FraudRule || mongoose.model('FraudRule', FraudRuleSchema);
module.exports = FraudRule;
