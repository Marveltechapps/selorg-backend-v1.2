const mongoose = require('mongoose');

const vendorInvoiceSchema = new mongoose.Schema({
  vendorId: { type: String, required: true, index: true },
  vendorName: { type: String, required: true },
  invoiceNumber: { type: String, required: true, unique: true, index: true },
  invoiceDate: { type: Date, required: true, index: true },
  dueDate: { type: Date, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'INR' },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending_approval', 'approved', 'scheduled', 'paid', 'overdue', 'rejected'],
    index: true 
  },
  paymentId: { type: String },
  uploadedBy: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  attachmentUrl: { type: String },
  notes: { type: String },
  items: [{
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    total: { type: Number, required: true },
  }],
}, {
  timestamps: true,
});

vendorInvoiceSchema.index({ vendorId: 1, status: 1 });
vendorInvoiceSchema.index({ dueDate: 1, status: 1 });
vendorInvoiceSchema.index({ invoiceDate: 1 });

module.exports = mongoose.models.VendorInvoice || mongoose.model('VendorInvoice', vendorInvoiceSchema);

