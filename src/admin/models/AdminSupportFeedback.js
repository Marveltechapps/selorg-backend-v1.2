/**
 * AdminSupportFeedback – Customer feedback for review.
 */
const mongoose = require('mongoose');

const adminSupportFeedbackSchema = new mongoose.Schema(
  {
    customerId: { type: String },
    customerName: { type: String },
    sentiment: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
    productOrCategory: { type: String },
    content: { type: String },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminSupportTicket' },
    rating: { type: Number },
  },
  { timestamps: true }
);

adminSupportFeedbackSchema.index({ sentiment: 1 });
adminSupportFeedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminSupportFeedback', adminSupportFeedbackSchema);
