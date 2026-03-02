const mongoose = require('mongoose');

const approvalTaskSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true, 
    enum: ['refund', 'invoice', 'vendor_payment', 'large_payment', 'adjustment'],
    index: true 
  },
  description: { type: String, required: true },
  details: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'INR' },
  requesterName: { type: String, required: true },
  requesterRole: { type: String, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true 
  },
  approverName: { type: String },
  approvedAt: { type: Date },
  relatedIds: {
    orderId: { type: String },
    invoiceId: { type: String },
    vendorId: { type: String },
    customerId: { type: String },
  },
  notes: { type: String },
}, {
  timestamps: true,
});

approvalTaskSchema.index({ status: 1, createdAt: -1 });
approvalTaskSchema.index({ type: 1, status: 1 });

module.exports = mongoose.models.ApprovalTask || mongoose.model('ApprovalTask', approvalTaskSchema);

