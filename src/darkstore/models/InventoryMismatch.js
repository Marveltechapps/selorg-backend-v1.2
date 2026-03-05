/**
 * InventoryMismatch - Reports of product quantity mismatches from pickers (picker app or HHD).
 * Per darkstore ops plan Part 6: Product, expected, actual, reportedBy.
 */
const mongoose = require('mongoose');

const inventoryMismatchSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    sku: { type: String, default: '' },
    storeId: { type: String, default: '' },
    expectedQty: { type: Number, default: null },
    actualQty: { type: Number, default: null },
    reason: { type: String, default: '' },
    reportedBy: { type: String, required: true }, // picker userId
    reportedByName: { type: String, default: '' },
    supportTicketId: { type: String, default: '' }, // if created from support ticket
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved'],
      default: 'open',
    },
  },
  { timestamps: true, collection: 'inventory_mismatches' }
);

inventoryMismatchSchema.index({ storeId: 1, createdAt: -1 });
inventoryMismatchSchema.index({ status: 1 });
inventoryMismatchSchema.index({ reportedBy: 1 });

module.exports =
  mongoose.models.InventoryMismatch || mongoose.model('InventoryMismatch', inventoryMismatchSchema);
