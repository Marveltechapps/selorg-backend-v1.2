const mongoose = require('mongoose');

const escalationSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminSupportTicket' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerOrder' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser' },
    type: {
      type: String,
      enum: [
        'missing_items', 'wrong_item', 'delay_in_packing',
        'store_cancellation', 'rider_not_reachable', 'delivery_failed',
        'wrong_delivery_attempt', 'otp_mismatch', 'reassign_request',
        'customer_complaint', 'refund_dispute', 'quality_issue', 'other',
      ],
      required: true,
    },
    targetTeam: {
      type: String,
      enum: ['darkstore', 'rider_ops', 'finance', 'admin', 'support'],
      required: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed', 'cancelled'],
      default: 'open',
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId },
    assignedStoreName: { type: String },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
    description: { type: String, required: true },
    resolutionNotes: { type: String, default: '' },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId },
    slaDeadline: { type: Date },
    slaBreached: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

escalationSchema.index({ targetTeam: 1, status: 1 });
escalationSchema.index({ storeId: 1, status: 1 });
escalationSchema.index({ riderId: 1, status: 1 });
escalationSchema.index({ ticketId: 1 });
escalationSchema.index({ orderId: 1 });

const Escalation =
  mongoose.models.Escalation ||
  mongoose.model('Escalation', escalationSchema);

module.exports = { Escalation };
