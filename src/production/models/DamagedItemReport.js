const mongoose = require('mongoose');

const damagedItemReportSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    damage_type: {
      type: String,
      required: false,
      enum: ['broken', 'crushed', 'leaking', 'expired', 'other'],
    },
    notes: {
      type: String,
      required: false,
    },
    reported_at: {
      type: Date,
      required: false,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

damagedItemReportSchema.index({ order_id: 1 });
damagedItemReportSchema.index({ sku: 1 });

module.exports = mongoose.models.DamagedItemReport || mongoose.model('DamagedItemReport', damagedItemReportSchema);

