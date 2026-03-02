/**
 * Faq service – from backend-workflow.yaml (faqs_list).
 * Returns only DB (seeded) data; empty array when no documents.
 */
const Faq = require('../models/faq.model');

const list = async () => {
  try {
    const list_ = await Faq.find().sort({ order: 1 }).lean();
    return list_.map((f, i) => ({ id: String(f._id), category: f.category, question: f.question, answer: f.answer, order: f.order ?? i }));
  } catch (_) {
    return [];
  }
};

module.exports = { list };
