const mongoose = require('mongoose');
const { Schema } = mongoose;

const CampaignSchema = new Schema({
  name: { type: String, required: true },
  tagline: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Active', 'Pending Review', 'Scheduled', 'Paused', 'Draft', 'Archived', 'Stopped', 'Ended'],
    default: 'Draft' 
  },
  period: { type: String, required: true },
  /** Optional end date for “ending soon” stats and extend flows */
  endsAt: { type: Date },
  target: { type: String, required: true },
  scope: { type: String, required: true },
  type: { type: String, required: true },
  owner: {
    name: { type: String, required: true },
    initial: { type: String, required: true }
  },
  kpi: {
    label: String,
    value: String,
    trend: { type: String, enum: ['up', 'down', 'neutral'] }
  },
  pendingDetails: {
    waitingOn: String,
    sla: String
  },
  rules: {
    discountLogic: { type: String, default: 'Flat 20% Off' },
    minOrder: { type: String, default: '$0.00' },
    segment: { type: String, default: 'All Customers' },
    stackable: { type: Boolean, default: false }
  },
  skus: [{
    sku: String,
    name: String,
    category: String,
    basePrice: Number,
    promoPrice: Number
  }],
  /** Report filters: na | eu | all */
  region: { type: String, enum: ['na', 'eu', 'all'], default: 'na' },
  /** Report filters: online | store | all */
  channel: { type: String, enum: ['online', 'store', 'all'], default: 'all' },
  /** Report filters: promo | clearance */
  campaignCategory: { type: String, enum: ['promo', 'clearance'], default: 'promo' },
  performance: {
    revenue: { type: Number },
    uplift: { type: Number },
    roi: { type: Number },
    discountDepth: { type: Number },
    orders: { type: Number },
  },
}, {
  timestamps: true
});

// Indexes for performance
CampaignSchema.index({ status: 1, createdAt: -1 });
CampaignSchema.index({ status: 1, endsAt: 1 });
CampaignSchema.index({ type: 1, status: 1 });
CampaignSchema.index({ owner: 1 });

module.exports = mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema);
