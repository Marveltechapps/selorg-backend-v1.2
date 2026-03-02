const mongoose = require('mongoose');

const ComplianceCheckSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  category: { type: String, default: 'General' },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  completedBy: { type: String }
}, { timestamps: true, collection: 'warehouse_compliance_checks' });

module.exports = mongoose.models.ComplianceCheck || mongoose.model('ComplianceCheck', ComplianceCheckSchema);
