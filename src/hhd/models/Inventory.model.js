const mongoose = require('mongoose');
const { INVENTORY_STATUS } = require('../utils/constants');

const InventorySchema = new mongoose.Schema(
  {
    sku: { type: String, required: [true, 'Please add a SKU'], index: true },
    binId: { type: String, required: [true, 'Please add a bin ID'], index: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: Object.values(INVENTORY_STATUS),
      default: INVENTORY_STATUS.AVAILABLE,
      index: true,
    },
    expiryDate: { type: Date },
    batchNumber: { type: String },
  },
  { timestamps: true, collection: 'hhd_inventory' }
);

InventorySchema.index({ sku: 1, binId: 1 }, { unique: true });
InventorySchema.index({ sku: 1, status: 1 });
InventorySchema.index({ binId: 1, status: 1 });

module.exports = mongoose.model('HHDInventory', InventorySchema);
