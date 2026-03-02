const mongoose = require('mongoose');

const inboundReceiptSchema = new mongoose.Schema(
  {
    poNumber: { type: String, required: true },
    supplier: { type: String, required: true },
    expectedDate: { type: Date, required: true },
    items: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'docking', 'received'], default: 'pending' },
  },
  { timestamps: true }
);

inboundReceiptSchema.index({ status: 1 });
inboundReceiptSchema.index({ poNumber: 1 });

module.exports = mongoose.models.InboundReceipt || mongoose.model('InboundReceipt', inboundReceiptSchema, 'prod_inbound_receipts');
