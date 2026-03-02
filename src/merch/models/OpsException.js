const mongoose = require('mongoose');
const { Schema } = mongoose;

const OpsExceptionSchema = new Schema({
  exceptionNumber: { type: String, required: true, unique: true, index: true },
  type: {
    type: String,
    enum: ['rto_risk', 'pickup_delay', 'payment_failed', 'delivery_delay', 'customer_unreachable'],
    required: true,
  },
  orderId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  riderId: { type: String, default: null },
  riderName: { type: String, default: null },
  storeId: { type: String, default: null },
  storeName: { type: String, default: null },
  zoneId: { type: String, default: null },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['open', 'resolved', 'escalated'],
    default: 'open',
    index: true,
  },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null },
  resolution: { type: String, default: null },
  cityId: { type: String, default: 'default', index: true },
}, {
  timestamps: true,
  collection: 'ops_exceptions',
});

OpsExceptionSchema.index({ status: 1, type: 1 });
OpsExceptionSchema.index({ createdAt: -1 });

module.exports = mongoose.models.OpsException || mongoose.model('OpsException', OpsExceptionSchema);
