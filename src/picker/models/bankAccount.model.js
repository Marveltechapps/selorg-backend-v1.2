/**
 * BankAccount model – from frontend YAML (BankAccountDetails, SavedBankAccount).
 * Fields per application-spec / backend-workflow.
 */
const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    accountHolder: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifscCode: { type: String, required: true },
    bankName: { type: String },
    branch: { type: String },
    isVerified: { type: Boolean, default: false },
    /** Finance approval for payouts (UI); does not replace isVerified from penny-drop style checks. */
    payoutVerificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'verified',
    },
    payoutRejectionReason: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

bankAccountSchema.index({ userId: 1 });

module.exports = mongoose.model('BankAccount', bankAccountSchema);
