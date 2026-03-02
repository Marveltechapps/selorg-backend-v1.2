const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true },
    product: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    line: { type: String, default: '' },
    operator: { type: String },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['pending', 'in-progress', 'completed', 'on-hold'], default: 'pending' },
    dueDate: { type: Date },
  },
  { timestamps: true }
);

workOrderSchema.index({ status: 1 });
workOrderSchema.index({ orderNumber: 1 });

module.exports = mongoose.models.WorkOrder || mongoose.model('WorkOrder', workOrderSchema, 'prod_work_orders');
