const mongoose = require('mongoose');
const lifestyleItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    title: { type: String, default: '' },
    imageUrl: String,
    link: String,
    redirectType: {
      type: String,
      enum: ['url', 'category', 'subcategory', 'collection', 'section', 'product', 'search', 'none', 'page', 'screen'],
      default: null,
    },
    redirectValue: String,
    blockKey: { type: String, unique: true, sparse: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
lifestyleItemSchema.index({ isActive: 1, order: 1 });
const LifestyleItem = mongoose.models.CustomerLifestyleItem || mongoose.model('CustomerLifestyleItem', lifestyleItemSchema, 'customer_lifestyle_items');
module.exports = { LifestyleItem };
