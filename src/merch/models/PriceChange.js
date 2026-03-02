const mongoose = require('mongoose');
const { Schema } = mongoose;

const PriceChangeSchema = new Schema({
  sku: { type: String, required: true },
  productName: { type: String, required: true },
  category: { type: String, required: true },
  currentPrice: { type: Number, required: true },
  proposedPrice: { type: Number, required: true },
  marginImpact: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  requestedBy: { type: String, required: true }
}, {
  timestamps: true
});

// Indexes for performance
PriceChangeSchema.index({ status: 1, createdAt: -1 });
PriceChangeSchema.index({ sku: 1 });

module.exports = mongoose.models.PriceChange || mongoose.model('PriceChange', PriceChangeSchema);
