const mongoose = require('mongoose');

const liveTransactionSchema = new mongoose.Schema({
  txnId: { type: String, required: true, unique: true, index: true },
  entityId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'INR' },
  methodDisplay: { type: String, required: true },
  maskedDetails: { type: String, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['success', 'failed', 'pending'],
    index: true 
  },
  gateway: { type: String, required: true, index: true },
  orderId: { type: String, index: true },
  customerName: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
});

liveTransactionSchema.index({ entityId: 1, createdAt: -1 });
liveTransactionSchema.index({ gateway: 1, status: 1 });

module.exports = mongoose.models.LiveTransaction || mongoose.model('LiveTransaction', liveTransactionSchema);

