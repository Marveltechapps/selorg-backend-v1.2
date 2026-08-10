/**
 * CategoryMedia — optional dedicated store for Category / SubCategory banner media
 * imported from Master Sheet sheets:
 *   - SubCategory Media / Sub Category Media
 *   - Category Media / Category Banner / Category Banners
 *
 * CustomerCategory also stores bannerImage / bannerVideo / youtubeUrl for fast reads;
 * this collection keeps an auditable 1:1 media row per categoryId.
 */
const mongoose = require('mongoose');

const categoryMediaSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerCategory',
      required: true,
      unique: true,
      index: true,
    },
    /** L1 = Category media, L2 = SubCategory media */
    level: { type: Number, default: 1, min: 1, max: 3, index: true },
    bannerImage: { type: String, default: '' },
    bannerVideo: { type: String, default: '' },
    youtubeUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    /** Sheet row snapshot for audit */
    importRaw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

categoryMediaSchema.index({ isActive: 1, level: 1 });

const CategoryMedia =
  mongoose.models.CustomerCategoryMedia ||
  mongoose.model('CustomerCategoryMedia', categoryMediaSchema, 'customer_category_media');

module.exports = { CategoryMedia };
