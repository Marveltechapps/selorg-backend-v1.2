const mongoose = require('mongoose');

const GRNItemSchema = new mongoose.Schema({
  sku: String,
  quantity: Number,
  receivedQuantity: Number,
  unit: String,
  remarks: String,
});

const GRNSchema = new mongoose.Schema(
  {
    vendorId: { type: String, required: true },
    poNumber: String,
    status: { type: String, default: 'PENDING' },
    receivedAt: Date,
    items: [GRNItemSchema],
    notes: String,
    rejectionReason: String,
    exceptions: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.models.GRN || mongoose.model('GRN', GRNSchema);

