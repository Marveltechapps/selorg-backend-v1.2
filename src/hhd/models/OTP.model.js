const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema(
  {
    mobile: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'hhd_otps' }
);

OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('HHDOTP', OTPSchema);
