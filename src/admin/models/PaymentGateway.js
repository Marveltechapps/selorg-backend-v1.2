/**
 * Payment Gateway configuration
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PaymentGatewaySchema = new Schema({
  name: { type: String, required: true },
  provider: { type: String, enum: ['razorpay', 'paytm', 'stripe', 'phonepe', 'cod'], required: true },
  isActive: { type: Boolean, default: true },
  apiKey: { type: String, default: '' },
  secretKey: { type: String, default: '' },
  merchantId: { type: String },
  transactionFee: { type: Number, default: 0 },
  transactionFeeType: { type: String, enum: ['percentage', 'flat'], default: 'percentage' },
  minAmount: { type: Number, default: 0 },
  maxAmount: { type: Number, default: 100000 },
  displayOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.models.PaymentGateway || mongoose.model('PaymentGateway', PaymentGatewaySchema);
