const mongoose = require('mongoose');

const rulesSchema = new mongoose.Schema(
  {
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' }],
    tagIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerTag' }],
    priceMin: Number,
    priceMax: Number,
    featured: Boolean,
  },
  { _id: false }
);

const scheduleSchema = new mongoose.Schema(
  {
    startDate: Date,
    endDate: Date,
  },
  { _id: false }
);

const collectionSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSite', default: null },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    type: { type: String, enum: ['manual', 'rule-based'], default: 'manual' },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct' }],
    rules: rulesSchema,
    sortBy: { type: String, enum: ['manual', 'price', 'priceDesc', 'createdAt', 'name'], default: 'manual' },
    isActive: { type: Boolean, default: true },
    schedule: scheduleSchema,
  },
  { timestamps: true }
);

collectionSchema.index({ siteId: 1, slug: 1 }, { unique: true });
collectionSchema.index({ isActive: 1 });
collectionSchema.index({ type: 1 });

const Collection = mongoose.models.CustomerCollection || mongoose.model('CustomerCollection', collectionSchema, 'customer_collections');
module.exports = { Collection };
