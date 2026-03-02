const mongoose = require('mongoose');

const ComplianceDocSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  type: { type: String, required: true },
  expiryDate: { type: Date },
  status: { type: String, enum: ['active', 'expired', 'pending'], default: 'active' },
  fileUrl: { type: String }
}, { timestamps: true, collection: 'warehouse_compliance_docs' });

module.exports = mongoose.models.ComplianceDoc || mongoose.model('ComplianceDoc', ComplianceDocSchema);

