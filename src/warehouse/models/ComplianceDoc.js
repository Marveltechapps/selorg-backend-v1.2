const mongoose = require('mongoose');

const ComplianceDocSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  title: { type: String, required: true },
  type: { type: String, required: true },
  expiryDate: { type: Date },
  status: { type: String, enum: ['active', 'expired', 'pending'], default: 'active' },
  fileUrl: { type: String }
}, { timestamps: true, collection: 'warehouse_compliance_docs' });

ComplianceDocSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

// Unique model name — darkstore/production also register `ComplianceDoc` on the shared connection.
module.exports =
  mongoose.models.WarehouseComplianceDoc ||
  mongoose.model('WarehouseComplianceDoc', ComplianceDocSchema);

