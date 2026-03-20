const mongoose = require('mongoose');

const contentItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['banner', 'video', 'image', 'text', 'products'], required: true },
    order: { type: Number, default: 0 },
    imageUrl: String,
    videoUrl: String,
    text: String,
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' }],
  },
  { _id: true }
);

const bannerSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSite', default: null },
    slot: { type: String, enum: ['hero', 'mid', 'category'], default: 'hero' },
    title: String,
    imageUrl: { type: String, required: true },
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerMedia', default: null },
    link: String, // Legacy - kept for backward compatibility during migration
    redirectType: {
      type: String,
      enum: ['url', 'category', 'subcategory', 'collection', 'section', 'product', 'search', 'none', 'page', 'screen', 'banner'],
      default: null,
    },
    redirectValue: String,
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' },
    isActive: { type: Boolean, default: true },
    startDate: Date,
    endDate: Date,
    order: { type: Number, default: 0 },
    /** When redirectType is 'banner', tapping shows a landing page with these items (arrangeable) */
    contentItems: [contentItemSchema],
  },
  { timestamps: true }
);
bannerSchema.index({ slot: 1, isActive: 1, order: 1 });
bannerSchema.index({ slot: 1, categoryId: 1, isActive: 1, order: 1 });

bannerSchema.pre('validate', function validateBannerDates(next) {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    return next(new Error('endDate must be greater than startDate'));
  }
  next();
});
const Banner = mongoose.models.CustomerBanner || mongoose.model('CustomerBanner', bannerSchema, 'customer_banners');
module.exports = { Banner };
