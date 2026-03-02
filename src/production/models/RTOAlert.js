const mongoose = require('mongoose');

const rtoAlertSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      match: /^ORD-\d+$/,
    },
    store_id: {
      type: String,
      required: true,
    },
    issue_type: {
      type: String,
      required: true,
      enum: ['address_issue', 'customer_unreachable', 'payment_failed', 'delivery_failed', 'other'],
    },
    description: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    customer_reachable: {
      type: Boolean,
      default: false,
    },
    is_resolved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
rtoAlertSchema.index({ order_id: 1 });
rtoAlertSchema.index({ store_id: 1, is_resolved: 1 });
rtoAlertSchema.index({ severity: 1 });

module.exports = mongoose.models.RTOAlert || mongoose.model('RTOAlert', rtoAlertSchema);

