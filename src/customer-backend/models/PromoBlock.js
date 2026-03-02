const mongoose = require('mongoose');
const promoBlockSchema = new mongoose.Schema(
  { blockKey: { type: String, required: true, unique: true }, imageUrl: { type: String, required: true }, link: String, order: { type: Number, default: 0 }, isActive: { type: Boolean, default: true } },
  { timestamps: true }
);
promoBlockSchema.index({ blockKey: 1 });
const PromoBlock = mongoose.models.CustomerPromoBlock || mongoose.model('CustomerPromoBlock', promoBlockSchema, 'customer_promo_blocks');
module.exports = { PromoBlock };
