const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    emoji: { type: String, default: '' },
    hierarchyCodes: [{ type: String }],
    level: { type: Number, default: 1, min: 1, max: 3, index: true },
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
categorySchema.index({ level: 1, isActive: 1, order: 1 });

categorySchema.pre('validate', async function validateHierarchy(next) {
  try {
    if (!this.parentId) {
      this.level = 1;
      return next();
    }
    const ParentModel = mongoose.model('CustomerCategory');
    const parent = await ParentModel.findById(this.parentId).select('level').lean();
    if (!parent) return next(new Error('Parent category not found'));
    if (parent.level >= 3) return next(new Error('Category depth cannot exceed level 3'));
    this.level = parent.level + 1;
    next();
  } catch (err) {
    next(err);
  }
});
const Category = mongoose.models.CustomerCategory || mongoose.model('CustomerCategory', categorySchema, 'customer_categories');
module.exports = { Category };
