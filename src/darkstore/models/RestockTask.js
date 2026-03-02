const mongoose = require('mongoose');

const restockTaskSchema = new mongoose.Schema(
  {
    task_id: {
      type: String,
      required: true,
      unique: true,
    },
    shelf_location: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    store_id: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: false,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

restockTaskSchema.index({ store_id: 1, status: 1 });
restockTaskSchema.index({ task_id: 1 });
restockTaskSchema.index({ shelf_location: 1 });

module.exports = mongoose.models.RestockTask || mongoose.model('RestockTask', restockTaskSchema);

