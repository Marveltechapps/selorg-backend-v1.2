/**
 * Transaction model – from frontend YAML (Transaction, TransactionHistoryResponse).
 * type: credit|debit, status: pending|processing|completed|failed, metadata.
 */
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    description: { type: String },
    referenceId: { type: String },
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
    metadata: { type: mongoose.Schema.Types.Mixed },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
