const mongoose = require('mongoose');
const otpSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    phoneNumber: { type: String, required: true, index: true },
    otpHash: { type: String, required: true },
    channel: { type: String, default: 'sms' },
    provider: { type: String },
    providerResponseId: { type: String },
    otpSentAt: { type: Date, default: Date.now },
    otpExpiresAt: { type: Date, required: true },
    resendCount: { type: Number, default: 0 },
    attemptCount: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    metadata: { ip: String, userAgent: String, deviceId: String },
  },
  { timestamps: true }
);
otpSessionSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 });
const OtpSession = mongoose.models.CustomerOtpSession || mongoose.model('CustomerOtpSession', otpSessionSchema, 'customer_otp_sessions');
module.exports = { OtpSession };
