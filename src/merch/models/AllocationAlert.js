const mongoose = require('mongoose');
const { Schema } = mongoose;

const AllocationAlertSchema = new Schema({
  skuId: { type: Schema.Types.ObjectId, ref: 'SKU' },
  sku: { type: String, required: true },
  location: { type: String, required: true },
  locationId: { type: String },
  allocationId: { type: Schema.Types.ObjectId, ref: 'Allocation' },
  type: { type: String, enum: ['low_stock', 'expiry'], default: 'low_stock' },
  severity: { type: String, enum: ['critical', 'warning', 'info'], default: 'warning' },
  message: { type: String, required: true },
  batch: { type: String },
  time: { type: String },
  status: { type: String, enum: ['active', 'dismissed'], default: 'active' },
}, {
  timestamps: true,
});

module.exports = mongoose.models.AllocationAlert || mongoose.model('AllocationAlert', AllocationAlertSchema);
