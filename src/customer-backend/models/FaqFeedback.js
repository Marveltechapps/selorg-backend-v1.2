/**
 * FAQ helpful/not-helpful votes from customers.
 * One vote per user per FAQ.
 */
const mongoose = require('mongoose');

const faqFeedbackSchema = new mongoose.Schema(
  {
    faqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerFaqItem',
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    helpful: { type: Boolean, required: true },
  },
  { timestamps: true }
);

faqFeedbackSchema.index({ faqId: 1, userId: 1 }, { unique: true });

const FaqFeedback =
  mongoose.models.CustomerFaqFeedback ||
  mongoose.model('CustomerFaqFeedback', faqFeedbackSchema, 'customer_faq_feedback');

module.exports = { FaqFeedback };
