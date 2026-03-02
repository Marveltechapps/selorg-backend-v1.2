const mongoose = require('mongoose');

const complianceLogSchema = new mongoose.Schema(
  {
    log_id: {
      type: String,
      required: true,
      unique: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['temperature', 'food_safety', 'fssai_docs', 'storage_conditions'],
    },
    zone: {
      type: String,
      required: true,
    },
    reading: {
      type: String,
      required: true,
    },
    threshold: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    logged_by: {
      type: String,
      required: true,
    },
    logged_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    notes: {
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

complianceLogSchema.index({ store_id: 1, category: 1, logged_at: -1 });
complianceLogSchema.index({ log_id: 1 });

module.exports = mongoose.models.ComplianceLog || mongoose.model('ComplianceLog', complianceLogSchema);

