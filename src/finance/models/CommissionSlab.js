const mongoose = require('mongoose');

const CommissionSlabSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
    },
    vendorTier: {
      type: String,
      enum: ['platinum', 'gold', 'silver', 'bronze'],
      required: true,
    },
    commissionRate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    minOrderValue: {
      type: Number,
      default: 0,
    },
    maxOrderValue: {
      type: Number,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

CommissionSlabSchema.index({ category: 1, vendorTier: 1 });
CommissionSlabSchema.index({ isActive: 1 });

module.exports = mongoose.models.CommissionSlab || mongoose.model('CommissionSlab', CommissionSlabSchema);

