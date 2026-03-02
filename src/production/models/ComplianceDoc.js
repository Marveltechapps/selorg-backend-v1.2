const mongoose = require('mongoose');

const complianceDocSchema = new mongoose.Schema(
  {
    doc_id: {
      type: String,
      required: true,
      unique: true,
    },
    doc_name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    issued_date: {
      type: String,
      required: true,
    },
    expiry_date: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['valid', 'expiring-soon', 'expired'],
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

complianceDocSchema.index({ store_id: 1, status: 1 });
complianceDocSchema.index({ doc_id: 1 });

module.exports = mongoose.models.ComplianceDoc || mongoose.model('ComplianceDoc', complianceDocSchema);

