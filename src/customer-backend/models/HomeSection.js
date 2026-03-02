const mongoose = require('mongoose');
const homeSectionSchema = new mongoose.Schema(
  { sectionKey: { type: String, required: true, unique: true }, title: String, productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' }], order: { type: Number, default: 0 }, isActive: { type: Boolean, default: true } },
  { timestamps: true }
);
homeSectionSchema.index({ sectionKey: 1 });
const HomeSection = mongoose.models.CustomerHomeSection || mongoose.model('CustomerHomeSection', homeSectionSchema, 'customer_home_sections');
module.exports = { HomeSection };
