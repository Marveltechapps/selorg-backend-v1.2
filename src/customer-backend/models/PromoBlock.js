const mongoose = require('mongoose');
const promoBlockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['greens_banner', 'section_image', 'fullwidth_image'], default: 'section_image' },
    blockKey: { type: String, required: true, unique: true },
    imageUrl: { type: String, required: true },
    link: String,
    redirectType: {
      type: String,
      enum: ['url', 'category', 'subcategory', 'collection', 'section', 'product', 'search', 'none', 'page', 'screen'],
      default: null,
    },
    redirectValue: String,
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
promoBlockSchema.index({ blockKey: 1 });
const PromoBlock = mongoose.models.CustomerPromoBlock || mongoose.model('CustomerPromoBlock', promoBlockSchema, 'customer_promo_blocks');
module.exports = { PromoBlock };
