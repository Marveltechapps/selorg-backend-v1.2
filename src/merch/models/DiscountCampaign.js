const mongoose = require('mongoose');
const { Schema } = mongoose;

const DiscountCampaignSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  discountType: {
    type: String,
    required: true,
    enum: ['percentage', 'flat', 'buy_x_get_y'],
  },
  discountValue: { type: Number, required: true, min: 0 },
  buyXGetYValue: { type: Number },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: null },
  applicableCategories: [{ type: String }],
  applicableProducts: [{ type: String }],
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  usageLimit: { type: Number, default: null },
  usageCount: { type: Number, default: 0 },
  stackable: { type: Boolean, default: false },
  status: {
    type: String,
    required: true,
    enum: ['active', 'scheduled', 'expired', 'paused'],
    default: 'active',
  },
}, { timestamps: true, collection: 'discount_campaigns' });

DiscountCampaignSchema.index({ status: 1, startDate: 1, endDate: 1 });
DiscountCampaignSchema.index({ applicableCategories: 1 });

module.exports = mongoose.models.DiscountCampaign || mongoose.model('DiscountCampaign', DiscountCampaignSchema);
