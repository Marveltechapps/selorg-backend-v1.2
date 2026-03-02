const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    type: { type: String, enum: ['card', 'upi', 'wallet'], required: true },
    last4: { type: String, default: '' },
    brand: { type: String, default: '' },
    cardholderName: { type: String, default: '' },
    upiId: { type: String, default: '' },
    walletName: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

paymentMethodSchema.index({ userId: 1 });
paymentMethodSchema.index({ userId: 1, isDefault: 1 });

const PaymentMethod =
  mongoose.models.CustomerPaymentMethod ||
  mongoose.model('CustomerPaymentMethod', paymentMethodSchema, 'customer_payment_methods');

module.exports = { PaymentMethod };
