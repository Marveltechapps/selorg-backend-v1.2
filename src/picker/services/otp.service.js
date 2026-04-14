/**
 * Picker OTP service – same flow as HHD device backend (createOTP, verifyOTP).
 * Uses Picker OTP model (collection picker_otps). SMS sending is done by auth.service via utils/smsGateway.
 */
const Otp = require('../models/otp.model');

function generateOTP(retryCount = 0) {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  if (otp.length !== 4) {
    if (retryCount < 3) return generateOTP(retryCount + 1);
    return otp.padStart(4, '0').slice(0, 4);
  }
  return otp;
}

/**
 * Create and store OTP for a phone. Deletes any existing unused OTPs for this phone first.
 * @param {string} phone - 10-digit normalized phone
 * @param {string} [otpOverride] - optional OTP to store (e.g. test OTP or dev fixed OTP)
 * @returns {Promise<string>} the OTP string that was stored
 */
async function createOTP(phone, otpOverride) {
  const normalizedMobile = String(phone).trim();
  const otp = otpOverride != null ? String(otpOverride).trim() : generateOTP();
  const expireMinutes = Math.max(1, Math.min(30, parseInt(process.env.OTP_EXPIRE_MINUTES || '5', 10)));
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expireMinutes);

  // Delete old unused OTPs for this phone to prevent verification issues
  // This ensures only the latest OTP is valid
  try {
    const deleteResult = await Otp.deleteMany({ phone: normalizedMobile, isUsed: false });
    if (deleteResult.deletedCount > 0) {
      console.log(`[Picker OTP] Deleted ${deleteResult.deletedCount} old unused OTP(s) for ${normalizedMobile}`);
    }
  } catch (err) {
    console.warn(`[Picker OTP] Failed to delete old OTPs for ${normalizedMobile}: ${err?.message}`);
  }

  const otpString = String(otp).trim();
  if (!/^\d{4}$/.test(otpString)) throw new Error(`Invalid OTP format: ${otpString}`);

  await Otp.create({ phone: normalizedMobile, code: otpString, expiresAt, isUsed: false });
  console.log(`[Picker OTP] Created new OTP for ${normalizedMobile}, expires at ${expiresAt.toISOString()}`);
  return otpString;
}

/**
 * Verify OTP for a phone. Marks the OTP as used on success.
 * @param {string} phone - 10-digit normalized phone
 * @param {string} otp - 4-digit OTP entered by user
 * @returns {Promise<boolean>} true if valid and marked used
 */
async function verifyOTP(phone, otp) {
  const normalizedMobile = String(phone).trim();
  const normalizedOtp = String(otp).trim();
  const currentTime = new Date();

  console.log(`[Picker OTP] Verifying OTP for ${normalizedMobile}, entered OTP: ${normalizedOtp}`);

  // Find all unused, non-expired OTPs for this phone, sorted by newest first
  const potentialOtps = await Otp.find({
    phone: normalizedMobile,
    isUsed: false,
    expiresAt: { $gt: currentTime },
  }).sort({ createdAt: -1 }).limit(5);

  console.log(`[Picker OTP] Found ${potentialOtps.length} unused OTP record(s) for ${normalizedMobile}`);

  if (potentialOtps.length === 0) {
    console.log(`[Picker OTP] Verification failed for ${normalizedMobile}: No valid OTP found`);
    return false;
  }

  // Try to find a matching OTP
  let matchedRecord = null;
  for (const record of potentialOtps) {
    const storedOtp = String(record.code).trim();
    console.log(`[Picker OTP] Comparing: stored="${storedOtp}", entered="${normalizedOtp}", recordId=${record._id}, createdAt=${record.createdAt.toISOString()}, expiresAt=${record.expiresAt.toISOString()}`);
    
    // Direct string comparison (most reliable)
    if (storedOtp === normalizedOtp) {
      matchedRecord = record;
      console.log(`[Picker OTP] ✓ Match found (string comparison)`);
      break;
    }
  }

  if (!matchedRecord) {
    console.log(`[Picker OTP] Verification failed for ${normalizedMobile}: OTP ${normalizedOtp} does not match any stored OTP`);
    return false;
  }

  // Mark the OTP as used
  const updateResult = await Otp.updateOne(
    { _id: matchedRecord._id, isUsed: false },
    { $set: { isUsed: true } }
  );

  if (updateResult.modifiedCount === 0) {
    console.warn(`[Picker OTP] Failed to mark OTP as used for ${normalizedMobile} (recordId=${matchedRecord._id}). It may have been used already.`);
    return false;
  }

  console.log(`[Picker OTP] ✓ Verification successful for ${normalizedMobile}, OTP marked as used (recordId=${matchedRecord._id})`);
  return true;
}

module.exports = {
  createOTP,
  verifyOTP,
  generateOTP,
};
