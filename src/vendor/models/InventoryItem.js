const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema(
  {
    vendorId: { type: String, required: true, index: true },
    sku: { type: String, required: true },
    name: String,
    quantity: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
    available: { type: Number, default: 0 },
    location: String,
    batchId: String,
    unit: { type: String, default: 'units' },
    unitPrice: { type: Number, default: 0 },
    physicalQty: Number,
    expiryDate: Date,
    agingDays: { type: Number, default: 0 },
    remarks: String,
    lastUpdated: Date,
    hubKey: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.VendorInventoryItem || mongoose.model('VendorInventoryItem', InventoryItemSchema, 'vendor_inventory_items');

