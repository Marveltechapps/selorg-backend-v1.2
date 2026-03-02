const mongoose = require('mongoose');

const putawayTaskSchema = new mongoose.Schema(
  {
    task_id: {
      type: String,
      required: true,
      unique: true,
    },
    grn_id: {
      type: String,
      required: false,
    },
    transfer_id: {
      type: String,
      required: false,
    },
    sku: {
      type: String,
      required: true,
    },
    product_name: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    actual_location: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'assigned', 'in_progress', 'completed'],
      default: 'pending',
    },
    assigned_to: {
      type: String,
      required: false,
    },
    staff_id: {
      type: String,
      required: false,
    },
    staff_name: {
      type: String,
      required: false,
    },
    store_id: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      required: false,
    },
    created_at: {
      type: String,
      required: true,
    },
    updated_at: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

putawayTaskSchema.index({ task_id: 1 });
putawayTaskSchema.index({ store_id: 1, status: 1 });
putawayTaskSchema.index({ grn_id: 1 });
putawayTaskSchema.index({ transfer_id: 1 });

module.exports = mongoose.models.PutawayTask || mongoose.model('PutawayTask', putawayTaskSchema);

