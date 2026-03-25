const mongoose = require('mongoose');

const UserEmailVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    requestedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: false,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

UserEmailVerificationSchema.index({ email: 1, createdAt: -1 });
UserEmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.UserEmailVerification ||
  mongoose.model('UserEmailVerification', UserEmailVerificationSchema);
