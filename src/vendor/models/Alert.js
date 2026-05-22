const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
  {
    vendorId: String,
    alertId: String,
    title: String,
    productName: String,
    batchId: String,
    type: String,
    expiryDate: Date,
    quantity: Number,
    unit: { type: String, default: 'units' },
    value: { type: Number, default: 0 },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
    status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
    message: String,
    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: String,
    note: String,
    hubKey: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.VendorAlert || mongoose.model('VendorAlert', AlertSchema, 'vendor_alerts');

