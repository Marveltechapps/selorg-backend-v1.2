const mongoose = require('mongoose');
const lifestyleItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    imageUrl: String,
    link: String,
    redirectType: { type: String, enum: ['product', 'category', 'collection', 'page', 'url', 'screen'], default: null },
    redirectValue: String,
    blockKey: String,
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
lifestyleItemSchema.index({ isActive: 1, order: 1 });
const LifestyleItem = mongoose.models.CustomerLifestyleItem || mongoose.model('CustomerLifestyleItem', lifestyleItemSchema, 'customer_lifestyle_items');
module.exports = { LifestyleItem };
