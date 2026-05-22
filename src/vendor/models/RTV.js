const mongoose = require('mongoose');

const RTVSchema = new mongoose.Schema(
  {
    rtvNumber: { type: String, required: true, index: true },
    grnId: { type: String, required: true, index: true },
    grnReference: { type: String, required: true },
    vendorId: String,
    vendor: String,
    reason: { type: String, required: true },
    quantity: String,
    status: { type: String, default: 'OPEN' },
    items: [{ type: String }],
    trackingSteps: [{ type: String }],
    currentTrackingStep: { type: Number, default: 0 },
    hubKey: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.VendorRTV || mongoose.model('VendorRTV', RTVSchema, 'vendor_rtvs');
