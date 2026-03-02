const mongoose = require('mongoose');

const TaxRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['GST', 'TDS', 'CESS', 'VAT'],
      required: true,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    applicableOn: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    threshold: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

TaxRuleSchema.index({ type: 1 });
TaxRuleSchema.index({ isActive: 1 });

module.exports = mongoose.models.TaxRule || mongoose.model('TaxRule', TaxRuleSchema);

