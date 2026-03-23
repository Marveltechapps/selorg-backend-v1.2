const mongoose = require('mongoose');

const ShipmentSchema = new mongoose.Schema(
  {
    trackingNumber: { type: String, required: true },
    carrier: String,
    status: { type: String, default: 'IN_TRANSIT' },
    estimatedArrival: Date,
    deliveredAt: Date,
    relatedGRNs: [String],
    hubKey: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Shipment || mongoose.model('Shipment', ShipmentSchema);

