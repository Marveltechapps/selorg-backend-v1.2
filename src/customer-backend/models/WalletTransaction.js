const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerWallet',
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerUser',
      required: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    source: {
      type: String,
      enum: [
        'refund', 'cashback', 'promotional', 'goodwill',
        'order_payment', 'manual_credit', 'manual_debit', 'expiry',
      ],
      required: true,
    },
    referenceId: { type: String },
    referenceType: {
      type: String,
      enum: ['order', 'refund', 'promotion', 'support_ticket', 'manual'],
    },
    description: { type: String, default: '' },
    expiresAt: { type: Date },
    isExpired: { type: Boolean, default: false },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ walletId: 1, createdAt: -1 });
walletTransactionSchema.index({ customerId: 1, createdAt: -1 });
walletTransactionSchema.index({ source: 1 });

const WalletTransaction =
  mongoose.models.WalletTransaction ||
  mongoose.model('WalletTransaction', walletTransactionSchema);

module.exports = { WalletTransaction };
