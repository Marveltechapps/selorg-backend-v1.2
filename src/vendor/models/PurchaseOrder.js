const mongoose = require('mongoose');

const PurchaseOrderItemSchema = new mongoose.Schema({
  sku: String,
  description: String,
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  tax: Number,
});

const PurchaseOrderSchema = new mongoose.Schema(
  {
    vendorId: { type: String, required: true },
    reference: String,
    externalReference: String,
    currency: { type: String, default: 'INR' },
    status: { type: String, default: 'draft' },
    items: [PurchaseOrderItemSchema],
    totals: {
      subTotal: Number,
      taxTotal: Number,
      shipping: Number,
      grandTotal: Number,
    },
    expectedDeliveryDate: Date,
    createdBy: String,
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', PurchaseOrderSchema);

