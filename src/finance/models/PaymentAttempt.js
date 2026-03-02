const mongoose = require('mongoose');

const paymentAttemptSchema = new mongoose.Schema({
  attempt_id: { type: String, required: true, unique: true, index: true },
  orderId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'INR' },
  methodType: { type: String, required: true, enum: ['card', 'wallet', 'net_banking', 'upi', 'cod'] },
  status: { type: String, required: true, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  gatewayRef: { type: String, required: false },
  failureReason: { type: String, required: false },
  createdAt: { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
});

paymentAttemptSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.models.PaymentAttempt || mongoose.model('PaymentAttempt', paymentAttemptSchema);

