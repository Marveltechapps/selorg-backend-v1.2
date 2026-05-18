const mongoose = require('mongoose');

const storeInventorySchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'DarkStore', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProduct', required: true },
    quantity: { type: Number, default: 0, min: 0 },
    isAvailable: { type: Boolean, default: true },
    reservedQty: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
  },
  { timestamps: true }
);

storeInventorySchema.index({ storeId: 1, productId: 1 }, { unique: true });
storeInventorySchema.index({ storeId: 1, isAvailable: 1 });

const StoreInventory =
  mongoose.models.StoreInventory ||
  mongoose.model('StoreInventory', storeInventorySchema, 'store_inventory');

module.exports = { StoreInventory };
