const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema(
  {
    // Hub scope (e.g. Chennai Hub). Production UI always sends `storeId`.
    store_id: { type: String, required: false, index: true },
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
workOrderSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.WorkOrder || mongoose.model('WorkOrder', workOrderSchema, 'prod_work_orders');
