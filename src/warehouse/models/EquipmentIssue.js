const mongoose = require('mongoose');

const EquipmentIssueSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  equipmentId: { type: String, required: true, index: true },
  reportedBy: { type: String, required: true },
  description: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  status: { type: String, enum: ['open', 'investigating', 'resolved'], default: 'open' },
  reportedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date },
  resolutionNotes: { type: String }
}, { timestamps: true, collection: 'warehouse_equipment_issues' });

module.exports = mongoose.models.EquipmentIssue || mongoose.model('EquipmentIssue', EquipmentIssueSchema);

