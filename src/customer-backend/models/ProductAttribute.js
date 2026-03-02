const mongoose = require('mongoose');

const productAttributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['text', 'select', 'number', 'boolean'], default: 'text' },
    options: [{ type: String }],
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productAttributeSchema.index({ isActive: 1, order: 1 });

const ProductAttribute =
  mongoose.models.CustomerProductAttribute ||
  mongoose.model('CustomerProductAttribute', productAttributeSchema, 'customer_product_attributes');

module.exports = { ProductAttribute };
