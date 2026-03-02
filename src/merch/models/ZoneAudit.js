const mongoose = require('mongoose');
const { Schema } = mongoose;

const ZoneAuditSchema = new Schema({
  zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', required: true },
  zoneName: { type: String, required: true },
  action: { type: String, enum: ['created', 'updated', 'activated', 'deactivated', 'deleted'], required: true },
  changes: { type: String, default: '' },
  performedBy: { type: String, default: 'system' },
}, { timestamps: true });

ZoneAuditSchema.index({ zoneId: 1 });
ZoneAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.models.ZoneAudit || mongoose.model('ZoneAudit', ZoneAuditSchema);
