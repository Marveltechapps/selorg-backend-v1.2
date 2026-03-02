const mongoose = require('mongoose');
const { Schema } = mongoose;

const flashSaleProductSchema = new Schema({
  sku: { type: String, required: true },
  name: { type: String, default: '' },
  originalPrice: { type: Number, required: true },
  salePrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  stockLimit: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
}, { _id: false });

const FlashSaleSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  products: [flashSaleProductSchema],
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['upcoming', 'active', 'ended'],
    default: 'upcoming',
  },
  visibility: {
    type: String,
    enum: ['public', 'members_only'],
    default: 'public',
  },
}, { timestamps: true, collection: 'flash_sales' });

FlashSaleSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.models.FlashSale || mongoose.model('FlashSale', FlashSaleSchema);
