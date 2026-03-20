const mongoose = require('mongoose');
const homeSectionSchema = new mongoose.Schema(
  {
    sectionKey: { type: String, required: true, unique: true, match: /^[a-z][a-z0-9_]*$/ },
    title: { type: String, default: '' },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' }],
    maxItems: { type: Number, default: 10 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    viewAllLink: { type: String, default: '' },
  },
  { timestamps: true }
);
homeSectionSchema.index({ sectionKey: 1 });
homeSectionSchema.index({ isActive: 1, order: 1 });
const HomeSection = mongoose.models.CustomerHomeSection || mongoose.model('CustomerHomeSection', homeSectionSchema, 'customer_home_sections');
module.exports = { HomeSection };
