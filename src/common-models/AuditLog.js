const mongoose = require('mongoose');
const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    module: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    entityType: {
      type: String,
    },
    entityId: {
      type: String,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // optional for auth events (e.g. login_failure)
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info',
    },
    details: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ module: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ severity: 1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
