const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      default: () =>
        `AUD-${Date.now()}${Math.floor(Math.random() * 1000000)
          .toString()
          .padStart(6, '0')}`,
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

auditLogSchema.pre('validate', function normalizeAuditId(next) {
  // Guard against callers accidentally passing string IDs into `_id`,
  // which is an ObjectId field in Mongo and causes BSON cast failures.
  if (typeof this._id === 'string' && this._id.trim()) {
    if (!this.id) {
      this.id = this._id;
    }
    this._id = undefined;
  }
  if (!this.id) {
    this.id = `AUD-${Date.now()}${Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

