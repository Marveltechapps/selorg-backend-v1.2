const mongoose = require('mongoose');

const PaymentTermSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    creditPeriod: {
      type: Number,
      required: true,
      min: 0,
    },
    lateFeePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    lateFeeGracePeriod: {
      type: Number,
      default: 0,
      min: 0,
    },
    applicableTo: {
      type: String,
      enum: ['vendors', 'customers', 'both'],
      default: 'both',
    },
    isDefault: {
      type: Boolean,
      default: false,
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

PaymentTermSchema.index({ isDefault: 1 });
PaymentTermSchema.index({ isActive: 1 });

module.exports = mongoose.models.PaymentTerm || mongoose.model('PaymentTerm', PaymentTermSchema);
