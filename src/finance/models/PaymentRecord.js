const mongoose = require('mongoose');

const paymentRecordSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  methodType: { type: String, required: true, enum: ['card', 'wallet', 'net_banking', 'upi', 'cod'] },
  status: { type: String, required: true, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  gatewayRef: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

paymentRecordSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.models.PaymentRecord || mongoose.model('PaymentRecord', paymentRecordSchema);

