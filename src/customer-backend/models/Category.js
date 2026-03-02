const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory', default: null },
    /** Optional: when set, tapping this category on home uses this link instead of CategoryProducts. Format: product:id, category:id, https://..., or ScreenName:param=val */
    link: { type: String, default: '' },
  },
  { timestamps: true }
);
categorySchema.index({ isActive: 1, order: 1 });
categorySchema.index({ parentId: 1, order: 1 });
const Category = mongoose.models.CustomerCategory || mongoose.model('CustomerCategory', categorySchema, 'customer_categories');
module.exports = { Category };
