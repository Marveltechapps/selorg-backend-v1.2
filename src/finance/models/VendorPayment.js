const mongoose = require('mongoose');
const { WORKFLOW_STEPS } = require('../constants/vendorPaymentWorkflow');

const workflowHistoryEntrySchema = new mongoose.Schema(
  {
    step: { type: String, enum: WORKFLOW_STEPS, required: true },
    status: { type: String, enum: ['completed', 'rejected', 'skipped'], required: true },
    completedAt: { type: Date, default: Date.now },
    completedBy: { type: String },
    notes: { type: String },
  },
  { _id: false }
);

const paymentInvoiceLineSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'VendorInvoice' },
    invoiceNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    currentStep: { type: String, enum: WORKFLOW_STEPS, required: true },
    lineStatus: {
      type: String,
      enum: ['in_progress', 'completed', 'rejected'],
      default: 'in_progress',
    },
    workflowHistory: [workflowHistoryEntrySchema],
  },
  { _id: false }
);

const vendorPaymentSchema = new mongoose.Schema(
  {
    hubKey: { type: String, trim: true, index: true },
    paymentId: { type: String, required: true, unique: true, index: true },
    vendorId: { type: String, required: true, index: true },
    vendorName: { type: String, required: true },
    attachmentUrl: { type: String, required: true },
    attachmentFileName: { type: String },
    attachmentContentType: { type: String },
    invoices: [paymentInvoiceLineSchema],
    totalAmount: { type: Number, required: true },
    paymentDate: { type: Date, required: true },
    method: { type: String, required: true },
    reference: { type: String, required: true },
    overallStatus: {
      type: String,
      enum: ['in_progress', 'completed', 'cancelled'],
      default: 'in_progress',
      index: true,
    },
    createdBy: { type: String, required: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String },
    cancelReason: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

vendorPaymentSchema.index({ hubKey: 1, overallStatus: 1 });
vendorPaymentSchema.index({ 'invoices.invoiceId': 1 });

module.exports =
  mongoose.models.VendorPayment || mongoose.model('VendorPayment', vendorPaymentSchema);
