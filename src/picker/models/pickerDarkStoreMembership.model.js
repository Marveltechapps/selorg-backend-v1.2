/**
 * Permanent picker ↔ dark store relationship with location-based 6-digit OTP.
 * Collection: picker_dark_store_memberships
 */
const mongoose = require('mongoose');

const pickerDarkStoreMembershipSchema = new mongoose.Schema(
  {
    pickerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PickerUser',
      required: true,
      index: true,
    },
    /** Normalized store/location id (ObjectId string or store code). */
    storeId: { type: String, required: true, trim: true, index: true },
    storeName: { type: String, default: '' },
    /** AES-256-GCM encrypted 6-digit location OTP (retrievable by authorized services). */
    otpCiphertext: { type: String, required: true },
    /** SHA-256(storeId:otp) for membership lookup. */
    otpHash: { type: String, required: true, index: true },
    firstLoginAt: { type: Date, required: true },
    lastLoginAt: { type: Date, required: true },
    loginCount: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, collection: 'picker_dark_store_memberships' }
);

pickerDarkStoreMembershipSchema.index({ pickerId: 1, storeId: 1 }, { unique: true });
pickerDarkStoreMembershipSchema.index({ storeId: 1, otpHash: 1 }, { unique: true });

module.exports = mongoose.model('PickerDarkStoreMembership', pickerDarkStoreMembershipSchema);
