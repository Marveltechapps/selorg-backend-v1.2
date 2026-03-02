const mongoose = require('mongoose');
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    description: { type: String, default: '' },
    images: [{ type: String }],
    imageUrl: { type: String, default: '' },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    costPrice: { type: Number, default: 0 },
    discount: { type: String },
    quantity: { type: String },
    stockQuantity: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    brand: { type: String, default: '' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' },
    subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory', default: null },
    status: { type: String, enum: ['active', 'inactive', 'draft'], default: 'active' },
    featured: { type: Boolean, default: false },
    variants: [{ sku: String, size: String, price: Number, originalPrice: Number }],
    attributes: {
      weight: String,
      dimensions: String,
      color: String,
      size: String,
      material: String,
      expiryDays: Number,
    },
    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
    order: { type: Number },
  },
  { timestamps: true }
);
productSchema.index({ isActive: 1, order: 1 });
productSchema.index({ categoryId: 1 });
productSchema.index({ subcategoryId: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ status: 1 });
productSchema.index({ createdAt: -1 });
const Product = mongoose.models.CustomerProduct || mongoose.model('CustomerProduct', productSchema, 'customer_products');
module.exports = { Product };
