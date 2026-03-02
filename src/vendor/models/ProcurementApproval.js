const mongoose = require('mongoose');

const RelatedIdsSchema = new mongoose.Schema({
  vendorId: String,
  poNumber: String,
  contractId: String,
}, { _id: false });

const ProcurementApprovalSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['vendor_onboarding', 'purchase_order', 'contract_renewal', 'price_change', 'payment_release'],
      index: true,
    },
    description: { type: String, required: true },
    details: { type: String, default: '' },
    requesterName: { type: String, required: true },
    requesterRole: { type: String, default: '' },
    valueAmount: { type: Number, default: null },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['high', 'normal', 'low'],
      default: 'normal',
      index: true,
    },
    relatedIds: { type: RelatedIdsSchema, default: {} },
    rejectionReason: { type: String, default: null },
    decisionNote: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null },
  },
  { timestamps: true, collection: 'procurement_approvals' }
);

ProcurementApprovalSchema.index({ status: 1, createdAt: -1 });
ProcurementApprovalSchema.index({ type: 1, status: 1 });

module.exports = mongoose.models.ProcurementApproval || mongoose.model('ProcurementApproval', ProcurementApprovalSchema);
