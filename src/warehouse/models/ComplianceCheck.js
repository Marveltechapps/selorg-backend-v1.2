const mongoose = require('mongoose');

const ComplianceCheckSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: { type: String, default: 'General' },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  completedBy: { type: String }
}, { timestamps: true, collection: 'warehouse_compliance_checks' });

ComplianceCheckSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.ComplianceCheck || mongoose.model('ComplianceCheck', ComplianceCheckSchema);
