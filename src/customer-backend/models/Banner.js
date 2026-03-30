const mongoose = require('mongoose');

/** Inline blocks inside a sub-page (no further nesting — keeps payload bounded). */
const leafContentItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['banner', 'video', 'image', 'text', 'products'], required: true },
    order: { type: Number, default: 0 },
    imageUrl: String,
    videoUrl: String,
    text: String,
    link: String,
    isNavigable: { type: Boolean, default: true },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' }],
  },
  { _id: true }
);

const contentItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['banner', 'video', 'image', 'text', 'products'], required: true },
    order: { type: Number, default: 0 },
    imageUrl: String,
    videoUrl: String,
    text: String,
    /** Optional title for a tappable inline block’s sub-page */
    blockTitle: String,
    /** Optional tap target for inline banner/image blocks when isNavigable is true */
    link: String,
    /** When false, inline banner/image is decorative only (no tap). Default true. */
    isNavigable: { type: Boolean, default: true },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' }],
    /** When tappable: same layout as main landing (hero = imageUrl, then these blocks). */
    nestedContentItems: [leafContentItemSchema],
  },
  { _id: true }
);

const bannerSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSite', default: null },
    /** Banner type (placement + semantics). Drives hero vs in-feed lane without changing app layout sizes. */
    slot: {
      type: String,
      enum: ['hero', 'small', 'mid', 'large', 'info', 'category'],
      default: 'hero',
    },
    /** Admin intent: single slide vs intended for carousel rows (section may add multiple IDs). */
    presentationMode: { type: String, enum: ['single', 'carousel'], default: 'single' },
    /** When false, home feed banner is display-only (no tap / detail). */
    isNavigable: { type: Boolean, default: true },
    title: String,
    imageUrl: { type: String, required: true },
    /** Optional wide/display URL (customer app prefers over imageUrl for hero/mid banners). */
    bannerImageUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
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
    // Raw import payload from mastersheet rows (for full-fidelity storage/audit).
    importRaw: { type: mongoose.Schema.Types.Mixed, default: null },
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
