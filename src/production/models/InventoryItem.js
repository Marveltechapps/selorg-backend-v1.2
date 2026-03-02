const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['Produce', 'Dairy', 'Bakery', 'Pantry', 'Snacks', 'Spreads', 'Supplements'],
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ['Fast Movers', 'Slow Movers', 'Out of Stock', 'Near Expiry', 'Overstocked'],
      default: 'Slow Movers',
    },
    trend: {
      type: String,
      required: true,
      enum: ['up', 'down', 'stable'],
      default: 'stable',
    },
    store_id: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: false,
    },
    barcode: {
      type: String,
      required: false,
      unique: false,
    },
  },
  {
    timestamps: true,
  }
);

inventoryItemSchema.index({ store_id: 1, category: 1 });
inventoryItemSchema.index({ sku: 1 });
inventoryItemSchema.index({ barcode: 1 });
inventoryItemSchema.index({ status: 1 });
inventoryItemSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.InventoryItem || mongoose.model('InventoryItem', inventoryItemSchema);

