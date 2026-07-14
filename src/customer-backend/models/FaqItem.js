const mongoose = require('mongoose');

const faqItemSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    order: { type: Number, default: 0 },
    category: { type: String, default: '', index: true },
    isActive: { type: Boolean, default: true },
    helpfulCount: { type: Number, default: 0 },
    notHelpfulCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

faqItemSchema.index({ isActive: 1, order: 1 });
faqItemSchema.index({ category: 1, isActive: 1, order: 1 });

const FaqItem = mongoose.models.CustomerFaqItem || mongoose.model('CustomerFaqItem', faqItemSchema, 'customer_faq_items');
module.exports = { FaqItem };
