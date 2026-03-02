/**
 * OTP model – aligned with HHD device backend flow.
 * Used by auth send-otp / verify-otp. Collection picker_otps (separate from hhd_otps).
 */
const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'picker_otps' }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
