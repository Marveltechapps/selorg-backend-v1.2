const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      unique: true,
      match: /^ORD-\d+$/,
    },
    store_id: {
      type: String,
      required: true,
    },
    order_type: {
      type: String,
      required: true,
      enum: ['Normal', 'Priority', 'Express', 'Premium'],
      default: 'Normal',
    },
    status: {
      type: String,
      required: true,
      enum: ['new', 'processing', 'ready', 'completed', 'cancelled', 'rto'],
      default: 'new',
    },
    item_count: {
      type: Number,
      required: true,
      min: 1,
    },
    sla_timer: {
      type: String,
      required: true,
      match: /^\d{2}:\d{2}$/,
    },
    sla_status: {
      type: String,
      required: true,
      enum: ['safe', 'warning', 'critical'],
      default: 'safe',
    },
    sla_deadline: {
      type: Date,
      required: true,
    },
    assignee: {
      id: {
        type: String,
        required: false,
      },
      name: {
        type: String,
        required: false,
      },
      initials: {
        type: String,
        required: false,
        match: /^[A-Z]{1,3}$/,
      },
    },
    rto_risk: {
      type: Boolean,
      default: false,
    },
    rto_reason: {
      type: String,
      required: false,
    },
    rto_notes: {
      type: String,
      required: false,
      maxlength: 1000,
    },
    rto_status: {
      type: String,
      enum: ['marked_rto', 'pending_confirmation', 'rto_confirmed'],
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
orderSchema.index({ store_id: 1, status: 1 });
orderSchema.index({ order_id: 1 });
orderSchema.index({ sla_deadline: 1 });
orderSchema.index({ rto_risk: 1 });

module.exports = mongoose.models.ProductionOrder || mongoose.model('ProductionOrder', orderSchema);

