/**
 * AdminSupportTicket – Admin Dashboard Support Center ticket management.
 * Stores full ticket data for admin-scoped operations.
 */
const mongoose = require('mongoose');

const ticketNoteSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminSupportTicket', required: true },
    authorId: { type: String, required: true },
    authorName: { type: String, required: true },
    type: {
      type: String,
      enum: ['customer_reply', 'agent_reply', 'internal_note', 'status_change', 'assignment'],
      default: 'agent_reply',
    },
    content: { type: String, required: true },
    isInternal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const adminSupportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    subject: { type: String, required: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['order', 'payment', 'delivery', 'account', 'technical', 'feedback'],
      default: 'order',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    channel: { type: String, enum: ['email', 'chat', 'phone', 'in_app'], default: 'in_app' },
    customerId: { type: String },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedToName: { type: String },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerOrder' },
    orderNumber: { type: String },
    tags: [{ type: String }],
    responseTime: { type: Number },
    resolutionTime: { type: Number },
    slaBreached: { type: Boolean, default: false },
    slaDeadline: { type: Date },
    rating: { type: Number },
    resolvedAt: { type: Date },
    escalatedTo: {
      type: String,
      enum: ['darkstore', 'rider_ops', 'finance', 'admin', ''],
      default: '',
    },
    escalationType: { type: String, default: '' },
    escalationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Escalation' },
    linkedRefundId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundRequest' },
    linkedRedeliveryId: { type: mongoose.Schema.Types.ObjectId },
    resolutionNote: { type: String, default: '' },
  },
  { timestamps: true }
);

adminSupportTicketSchema.index({ status: 1, priority: 1 });
adminSupportTicketSchema.index({ category: 1 });
adminSupportTicketSchema.index({ assignedTo: 1 });
adminSupportTicketSchema.index({ createdAt: -1 });

// Separate notes collection for easier querying
const AdminSupportTicketNote = mongoose.model(
  'AdminSupportTicketNote',
  ticketNoteSchema
);

const AdminSupportTicket = mongoose.model('AdminSupportTicket', adminSupportTicketSchema);

module.exports = { AdminSupportTicket, AdminSupportTicketNote };
