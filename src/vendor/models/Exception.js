const mongoose = require('mongoose');

const ExceptionSchema = new mongoose.Schema(
  {
    grnId: { type: String, required: true },
    grnReference: String,
    type: String,
    description: String,
    status: { type: String, default: 'OPEN' },
    resolvedAt: Date,
    hubKey: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.VendorInboundException || mongoose.model('VendorInboundException', ExceptionSchema, 'vendor_inbound_exceptions');

