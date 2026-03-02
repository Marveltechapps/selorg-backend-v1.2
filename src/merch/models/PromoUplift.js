const mongoose = require('mongoose');
const { Schema } = mongoose;

const PromoUpliftSchema = new Schema({
  month: { type: String, required: true },
  uplift: { type: Number, required: true },
  revenue: { type: Number, required: true },
  campaignsCount: { type: Number, required: true },
  topCategory: { type: String, required: true }
}, {
  timestamps: true
});

module.exports = mongoose.models.PromoUplift || mongoose.model('PromoUplift', PromoUpliftSchema);
