/**
 * AdminSupportCategory – Ticket categories with SLA targets and metrics.
 */
const mongoose = require('mongoose');

const adminSupportCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: 'ShoppingBag' },
    slaTarget: { type: Number, default: 60 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminSupportCategory', adminSupportCategorySchema);
