const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  id: { type: String },
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  taxPercent: { type: Number, required: true, default: 0 },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, index: true },
  customerId: { type: String, index: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true, index: true },
  issueDate: { type: Date, required: true, index: true },
  dueDate: { type: Date, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'INR' },
  status: { 
    type: String, 
    required: true, 
    enum: ['sent', 'pending', 'overdue', 'paid', 'draft', 'cancelled'],
    index: true 
  },
  items: [invoiceItemSchema],
  notes: { type: String },
  pdfUrl: { type: String },
  lastReminderAt: { type: Date },
}, {
  timestamps: true,
});

invoiceSchema.index({ customerId: 1, status: 1 });
invoiceSchema.index({ dueDate: 1, status: 1 });
invoiceSchema.index({ issueDate: -1 });

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);

