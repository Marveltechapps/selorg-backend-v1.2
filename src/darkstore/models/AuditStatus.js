const mongoose = require('mongoose');

const auditStatusSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },
    last_passed: {
      type: Date,
      required: true,
    },
    next_audit: {
      type: Date,
      required: true,
    },
    critical_checks_up_to_date: {
      type: Boolean,
      required: true,
    },
    message: {
      type: String,
      required: false,
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

auditStatusSchema.index({ store_id: 1 });

module.exports = mongoose.models.AuditStatus || mongoose.model('AuditStatus', auditStatusSchema);

