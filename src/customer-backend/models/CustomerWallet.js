const mongoose = require('mongoose');

const customerWalletSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerUser',
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0, min: 0 },
    pendingCredits: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    isActive: { type: Boolean, default: true },
    lastTransactionAt: { type: Date },
  },
  { timestamps: true }
);

customerWalletSchema.index({ customerId: 1 });

const CustomerWallet =
  mongoose.models.CustomerWallet ||
  mongoose.model('CustomerWallet', customerWalletSchema);

module.exports = { CustomerWallet };
