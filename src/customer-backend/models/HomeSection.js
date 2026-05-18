const mongoose = require('mongoose');
const homeSectionSchema = new mongoose.Schema(
  {
    sectionKey: { type: String, required: true, unique: true },
    title: { type: String, default: '' },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' }],
    maxItems: { type: Number, default: 10 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    viewAllLink: { type: String, default: '' },
    sectionType: { type: String, default: 'products' },
    bannerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerBanner' }],
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' }],
    videoUrl: { type: String, default: '' },
    rawDetail: { type: mongoose.Schema.Types.Mixed, default: null },
    importedBannerCodes: [{ type: String }],
    importedSkuCodes: [{ type: String }],
    importedCategoryNames: [{ type: String }],
  },
  { timestamps: true }
);
homeSectionSchema.index({ sectionKey: 1 });
homeSectionSchema.index({ isActive: 1, order: 1 });
const HomeSection = mongoose.models.CustomerHomeSection || mongoose.model('CustomerHomeSection', homeSectionSchema, 'customer_home_sections');
module.exports = { HomeSection };
