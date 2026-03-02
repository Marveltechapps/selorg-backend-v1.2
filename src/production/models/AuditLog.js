const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    timestamp: {
      type: String,
      required: true,
    },
    action_type: {
      type: String,
      required: true,
      enum: ['adjustment', 'scan', 'update', 'delete', 'cycle_count', 'auto_replenish', 'override_price', 'login_failed', 'store_mode', 'data_push', 'create'],
    },
    user: {
      type: String,
      required: true,
    },
    user_id: {
      type: String,
      required: false,
    },
    user_name: {
      type: String,
      required: false,
    },
    module: {
      type: String,
      enum: ['inbound', 'inventory', 'picking', 'packing', 'auth', 'settings', 'sync', 'outbound', 'qc', 'staff', 'health', 'hsd', 'compliance'],
      required: false,
    },
    action: {
      type: String,
      required: false,
    },
    sku: {
      type: String,
      required: false,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    ip_address: {
      type: String,
      required: false,
    },
    changes: {
      stock_before: {
        type: Number,
        required: false,
      },
      stock_after: {
        type: Number,
        required: false,
      },
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

auditLogSchema.index({ store_id: 1, createdAt: -1 });
auditLogSchema.index({ action_type: 1 });
auditLogSchema.index({ user: 1 });
auditLogSchema.index({ sku: 1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

