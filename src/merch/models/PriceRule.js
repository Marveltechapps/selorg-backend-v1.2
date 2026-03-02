const mongoose = require('mongoose');
const { Schema } = mongoose;

const PriceRuleSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['base', 'geo', 'time', 'campaign'], default: 'base' },
  scope: { type: String, enum: ['region', 'zone', 'store'], default: 'region' },
  pricingMethod: { type: String, enum: ['fixed', 'cost-plus', 'competitor'], default: 'fixed' },
  marginMin: { type: Number },
  marginMax: { type: Number },
  startDate: { type: Date },
  endDate: { type: Date },
  status: { type: String, enum: ['active', 'pending', 'expired', 'inactive'], default: 'pending' },
}, { timestamps: true, collection: 'price_rules' });

PriceRuleSchema.index({ status: 1, type: 1 });

module.exports = mongoose.models.PriceRule || mongoose.model('PriceRule', PriceRuleSchema);
