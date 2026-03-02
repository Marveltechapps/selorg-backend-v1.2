const mongoose = require('mongoose');
const bannerSchema = new mongoose.Schema(
  {
    slot: { type: String, enum: ['hero', 'mid', 'category'], default: 'hero' },
    title: String,
    imageUrl: { type: String, required: true },
    link: String,
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' },
    isActive: { type: Boolean, default: true },
    startDate: Date,
    endDate: Date,
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
bannerSchema.index({ slot: 1, isActive: 1, order: 1 });
bannerSchema.index({ slot: 1, categoryId: 1, isActive: 1, order: 1 });
const Banner = mongoose.models.CustomerBanner || mongoose.model('CustomerBanner', bannerSchema, 'customer_banners');
module.exports = { Banner };
