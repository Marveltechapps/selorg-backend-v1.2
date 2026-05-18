const mongoose = require('mongoose');

const competitorPriceSchema = new mongoose.Schema({
  trackingId: {
    type: String,
    required: true,
    unique: true,
  },
  sku: {
    type: String,
    required: true,
  },
  competitorId: String,
  competitorName: String,
  competitorPrice: {
    type: Number,
    required: true,
  },
  ourPrice: Number,
  priceDifference: Number,
  pricePercentageDifference: Number,
  priceStatus: {
    type: String,
    enum: ['LOWER', 'EQUAL', 'HIGHER'],
  },
  availability: {
    competitorStock: { type: String, enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] },
    ourStock: { type: String, enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] },
  },
  priceHistory: [{
    date: Date,
    price: Number,
  }],
  trackingSource: {
    type: String,
    enum: ['MANUAL', 'AUTOMATED', 'API', 'SCRAPER'],
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  recommendations: {
    suggestedAction: String,
    recommendedPrice: Number,
    rationale: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'competitor_prices' });

competitorPriceSchema.index({ sku: 1 });
competitorPriceSchema.index({ competitorId: 1 });
competitorPriceSchema.index({ lastUpdated: -1 });

module.exports = mongoose.model('CompetitorPrice', competitorPriceSchema);
