const mongoose = require('mongoose');

const customerCallSchema = new mongoose.Schema(
  {
    call_id: {
      type: String,
      required: true,
      unique: true,
      match: /^CALL-\d+$/,
    },
    order_id: {
      type: String,
      required: true,
      match: /^ORD-\d+$/,
    },
    store_id: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    status: {
      type: String,
      required: true,
      enum: ['initiated', 'ringing', 'answered', 'failed', 'completed'],
      default: 'initiated',
    },
    duration: {
      type: Number,
      required: false,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
customerCallSchema.index({ order_id: 1 });
customerCallSchema.index({ call_id: 1 });
customerCallSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.CustomerCall || mongoose.model('CustomerCall', customerCallSchema);

