const mongoose = require('mongoose');

const customerPaymentSchema = new mongoose.Schema({
  entityId: { type: String, default: 'default', index: true },
  customerName: { type: String, required: true, index: true },
  customerEmail: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'INR' },
  paymentMethodDisplay: { type: String, required: true },
  methodType: { 
    type: String, 
    required: true, 
    enum: ['card', 'wallet', 'net_banking', 'cod', 'upi', 'cash'],
    index: true 
  },
  gatewayRef: { type: String, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['captured', 'authorized', 'pending', 'declined', 'refunded', 'chargeback'],
    index: true 
  },
  retryEligible: { type: Boolean, default: false },
  failureReason: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
  lastUpdatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

customerPaymentSchema.index({ customerEmail: 1, createdAt: -1 });
customerPaymentSchema.index({ orderId: 1 });
customerPaymentSchema.index({ status: 1, createdAt: -1 });
customerPaymentSchema.index({ entityId: 1, createdAt: -1 });

module.exports = mongoose.models.CustomerPayment || mongoose.model('CustomerPayment', customerPaymentSchema);

