/**
 * SupportTicket model – from backend-workflow.yaml (support_tickets collection).
 */
const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String },
    subject: { type: String },
    message: { type: String },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
