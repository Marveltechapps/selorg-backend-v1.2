const mongoose = require('mongoose');
const { Schema } = mongoose;

const AlertSchema = new Schema({
  type: { type: String, enum: ['Pricing', 'Stock', 'Campaign', 'System'], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
  status: { type: String, enum: ['New', 'In Progress', 'Resolved', 'Snoozed', 'Dismissed'], default: 'New' },
  region: { type: String },
  linkedEntities: {
    skus: [{ type: String }],
    campaigns: [{
      id: { type: String },
      name: { type: String }
    }],
    store: { type: String }
  }
}, {
  timestamps: true
});

// Indexes for performance
AlertSchema.index({ status: 1, severity: 1, createdAt: -1 });
AlertSchema.index({ type: 1, status: 1 });
AlertSchema.index({ region: 1 });

module.exports = mongoose.models.Alert || mongoose.model('MerchAlert', AlertSchema);
