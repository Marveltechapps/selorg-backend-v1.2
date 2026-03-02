const mongoose = require('mongoose');

const alertHistorySchema = new mongoose.Schema(
  {
    entity_type: {
      type: String,
      required: true,
      enum: ['ORDER', 'SKU'],
    },
    entity_id: {
      type: String,
      required: true,
    },
    alert_type: {
      type: String,
      required: true,
      enum: ['RTO', 'STOCK_OUT'],
    },
    action: {
      type: String,
      required: true,
      enum: ['MARK_RTO', 'CALL_CUSTOMER', 'RESTOCK'],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    performed_by: {
      type: String,
      default: 'system',
    },
    store_id: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
alertHistorySchema.index({ entity_type: 1, entity_id: 1 });
alertHistorySchema.index({ alert_type: 1, entity_id: 1 });
alertHistorySchema.index({ store_id: 1, createdAt: -1 });
alertHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.models.AlertHistory || mongoose.model('AlertHistory', alertHistorySchema);

