const mongoose = require('mongoose');

const missingItemReportSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
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

missingItemReportSchema.index({ order_id: 1 });
missingItemReportSchema.index({ sku: 1 });

module.exports = mongoose.models.MissingItemReport || mongoose.model('MissingItemReport', missingItemReportSchema);

