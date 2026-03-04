const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    domain: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

siteSchema.index({ slug: 1 });
siteSchema.index({ isActive: 1 });

const Site = mongoose.models.CustomerSite || mongoose.model('CustomerSite', siteSchema, 'customer_sites');
module.exports = { Site };
