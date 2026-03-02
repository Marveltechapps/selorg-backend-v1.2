/**
 * Faq model – from backend-workflow.yaml (faqs collection).
 */
const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
  {
    category: { type: String },
    question: { type: String },
    answer: { type: String },
    order: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Faq', faqSchema);
