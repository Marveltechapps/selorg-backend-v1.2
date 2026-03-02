const mongoose = require('mongoose');

const shelfSKUSchema = new mongoose.Schema(
  {
    shelf_id: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    product_name: {
      type: String,
      required: true,
    },
    stock_count: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

shelfSKUSchema.index({ shelf_id: 1 });
shelfSKUSchema.index({ sku: 1 });

module.exports = mongoose.models.ShelfSKU || mongoose.model('ShelfSKU', shelfSKUSchema);

