const mongoose = require('mongoose');
const { Schema } = mongoose;

const bundleProductSchema = new Schema({
  sku: { type: String, required: true },
  name: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
}, { _id: false });

const BundleSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  products: [bundleProductSchema],
  totalOriginalPrice: { type: Number, required: true },
  bundlePrice: { type: Number, required: true },
  savings: { type: Number, default: 0 },
  savingsPercent: { type: Number, default: 0 },
  imageUrl: { type: String, default: '' },
  stockLimit: { type: Number, default: null },
  soldCount: { type: Number, default: 0 },
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  featured: { type: Boolean, default: false },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
}, { timestamps: true, collection: 'bundles' });

BundleSchema.index({ status: 1 });
BundleSchema.index({ featured: 1 });

module.exports = mongoose.models.Bundle || mongoose.model('Bundle', BundleSchema);
