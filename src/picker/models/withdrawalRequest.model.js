/**
 * WithdrawalRequest model – Picker wallet withdrawal workflow.
 * Status flow: PENDING → APPROVED → PAID | REJECTED
 * Amount is locked on request; deducted only when Mark Paid.
 */
const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS } = require('../../constants/pickerEnums');

const withdrawalRequestSchema = new mongoose.Schema(
  {
    pickerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerUser', required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: Object.values(WITHDRAWAL_STATUS), default: WITHDRAWAL_STATUS.PENDING },
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
    idempotencyKey: { type: String, sparse: true, unique: true },
    requestedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId },
    paidAt: { type: Date },
    rejectedAt: { type: Date },
    rejectedReason: { type: String },
  },
  { timestamps: true }
);

withdrawalRequestSchema.index({ pickerId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ idempotencyKey: 1 }, { sparse: true });

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
