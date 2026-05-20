/**
 * SupportTicket model – from backend-workflow.yaml (support_tickets collection).
 */
const mongoose = require('mongoose');

const supportTicketReplySchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true },
    authorName: { type: String, required: true },
    type: {
      type: String,
      enum: ['customer_reply', 'agent_reply', 'internal_note'],
      default: 'agent_reply',
    },
    content: { type: String, required: true },
    isInternal: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String },
    subject: { type: String },
    message: { type: String },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    replies: { type: [supportTicketReplySchema], default: [] },
    assignedTo: { type: String, default: '' },
    assignedToName: { type: String, default: '' },
    orderNumber: { type: String, default: '' },
    escalatedTo: { type: String, enum: ['', 'darkstore', 'rider_ops', 'finance', 'admin'], default: '' },
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
