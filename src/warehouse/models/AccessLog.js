const mongoose = require('mongoose');

const AccessLogSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  user: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: String },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'warehouse_access_logs' });

AccessLogSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.AccessLog || mongoose.model('AccessLog', AccessLogSchema);

