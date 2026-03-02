const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
  {
    vendorId: String,
    type: String,
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
    status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
    message: String,
    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: String,
    note: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Alert || mongoose.model('Alert', AlertSchema);

