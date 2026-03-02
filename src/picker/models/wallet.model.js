/**
 * Wallet model – from frontend YAML (WalletBalance).
 * availableBalance, pendingBalance, totalEarnings, currency.
 */
const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    availableBalance: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
