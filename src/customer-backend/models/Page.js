const mongoose = require('mongoose');
const { BLOCK_TYPES } = require('../shared/constants');

const visibilityRulesSchema = new mongoose.Schema(
  {
    userLoggedIn: { type: Boolean, default: null },
    minAppVersion: String,
    location: [String],
    userSegment: [String],
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

const pageBlockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: BLOCK_TYPES, required: true },
    order: { type: Number, default: 0 },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    dataSource: {
      collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCollection' },
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCategory' }],
    },
    visibilityRules: visibilityRulesSchema,
    schedule: scheduleSchema,
  },
  { _id: true }
);

const pageSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSite', default: null },
    slug: { type: String, required: true },
    title: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    blocks: [pageBlockSchema],
    version: { type: Number, default: 1 },
    previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerPage', default: null },
    publishedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

pageSchema.index({ siteId: 1, slug: 1 }, { unique: true });
pageSchema.index({ status: 1 });
pageSchema.index({ publishedAt: -1 });

const Page = mongoose.models.CustomerPage || mongoose.model('CustomerPage', pageSchema, 'customer_pages');
module.exports = { Page };
