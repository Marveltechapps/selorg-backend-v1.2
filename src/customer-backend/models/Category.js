const mongoose = require('mongoose');
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    /** Optional optimized URL for list/grid tiles (app prefers over imageUrl). */
    thumbnailUrl: { type: String, default: '' },
    /** Optional mid-size URL for cards (falls back to thumbnailUrl / imageUrl). */
    cardImageUrl: { type: String, default: '' },
    emoji: { type: String, default: '' },
    hierarchyCodes: [{ type: String }],
    level: { type: Number, default: 1, min: 1, max: 3, index: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory', default: null },
    /** Optional: when set, tapping this category on home uses this link instead of CategoryProducts. Format: product:id, category:id, https://..., or ScreenName:param=val */
    link: { type: String, default: '' },
    // Raw import payload from mastersheet row (for full-fidelity storage/audit).
    importRaw: { type: mongoose.Schema.Types.Mixed, default: null },
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
    // Important: during imports we may be creating/updating categories inside a
    // MongoDB transaction session. Mongoose validation runs before the insert
    // is committed, so parent lookups must use the same session, otherwise
    // it can incorrectly fail with "Parent category not found".
    const session = typeof this.$session === 'function' ? this.$session() : null;
    const q = ParentModel.findById(this.parentId).select('level').lean();
    const parent = session ? await q.session(session) : await q;
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
