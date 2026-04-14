/**
 * Manager approval OTP for device collection (one active record per picker).
 */
const mongoose = require('mongoose');

const managerOtpSchema = new mongoose.Schema(
  {
    pickerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerUser', required: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    used: { type: Boolean, default: false },
    managerPhone: { type: String, required: true },
  },
  { timestamps: true, collection: 'picker_manager_otps' }
);

managerOtpSchema.index({ pickerId: 1, used: 1 });

module.exports = mongoose.models.PickerManagerOTP || mongoose.model('PickerManagerOTP', managerOtpSchema);
