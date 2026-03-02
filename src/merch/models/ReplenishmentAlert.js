const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReplenishmentAlertSchema = new Schema({
  type: { type: String, enum: ['low_stock', 'expiry', 'overstock'], required: true },
  severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
  sku: { type: String, required: true },
  skuId: { type: Schema.Types.ObjectId, ref: 'SKU' },
  location: { type: String, required: true },
  message: { type: String, required: true },
  batch: { type: String },
  time: { type: String, required: true },
  status: { type: String, enum: ['active', 'dismissed', 'resolved'], default: 'active' }
}, {
  timestamps: true
});

module.exports = mongoose.models.ReplenishmentAlert || mongoose.model('ReplenishmentAlert', ReplenishmentAlertSchema);
