const mongoose = require('mongoose');

const packagingSuggestionSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
    },
    medium_bags: {
      type: Number,
      required: false,
      default: 0,
    },
    cooler_bags: {
      type: Number,
      required: false,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

packagingSuggestionSchema.index({ order_id: 1 });

module.exports = mongoose.models.PackagingSuggestion || mongoose.model('PackagingSuggestion', packagingSuggestionSchema);

