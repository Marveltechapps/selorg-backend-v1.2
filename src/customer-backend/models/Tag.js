const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSite', default: null },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    type: { type: String, enum: ['product', 'campaign'], default: 'product' },
  },
  { timestamps: true }
);

tagSchema.index({ siteId: 1, slug: 1 }, { unique: true });
tagSchema.index({ type: 1 });

const Tag = mongoose.models.CustomerTag || mongoose.model('CustomerTag', tagSchema, 'customer_tags');
module.exports = { Tag };
