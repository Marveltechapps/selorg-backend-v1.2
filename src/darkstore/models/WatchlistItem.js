const mongoose = require('mongoose');

const watchlistItemSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
    },
    product_name: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: false,
    },
    required_check: {
      type: String,
      required: true,
    },
    last_check: {
      type: Date,
      required: false,
    },
    next_check: {
      type: Date,
      required: false,
    },
    status: {
      type: String,
      required: true,
      default: 'active',
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

watchlistItemSchema.index({ store_id: 1, status: 1 });
watchlistItemSchema.index({ sku: 1 });

module.exports = mongoose.models.WatchlistItem || mongoose.model('WatchlistItem', watchlistItemSchema);

