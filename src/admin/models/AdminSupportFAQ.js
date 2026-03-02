/**
 * AdminSupportFAQ – FAQ management for support center.
 */
const mongoose = require('mongoose');

const adminSupportFAQSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String, default: 'general' },
    keywords: [{ type: String }],
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

adminSupportFAQSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('AdminSupportFAQ', adminSupportFAQSchema);
