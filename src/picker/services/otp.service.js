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

  try {
    await Otp.deleteMany({ phone: normalizedMobile, isUsed: false });
  } catch (e) {
    console.warn('[Picker OTP] Failed to delete existing OTPs:', e?.message);
  }

  const otpString = String(otp).trim();
  if (!/^\d{4}$/.test(otpString)) throw new Error(`Invalid OTP format: ${otpString}`);

  await Otp.create({ phone: normalizedMobile, code: otpString, expiresAt, isUsed: false });
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

  let otpRecord = await Otp.findOne({
    phone: normalizedMobile,
    code: normalizedOtp,
    isUsed: false,
    expiresAt: { $gt: currentTime },
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    const allOtps = await Otp.find({ phone: normalizedMobile }).sort({ createdAt: -1 }).limit(5);
    const validOtps = allOtps.filter((r) => !r.isUsed && r.expiresAt > currentTime);
    for (const record of validOtps) {
      const recordOtp = String(record.code).trim();
      if (recordOtp === normalizedOtp) {
        otpRecord = record;
        break;
      }
      const rNum = parseInt(recordOtp, 10);
      const pNum = parseInt(normalizedOtp, 10);
      if (!isNaN(rNum) && !isNaN(pNum) && rNum === pNum) {
        otpRecord = record;
        break;
      }
    }
  }

  if (!otpRecord) return false;

  await Otp.updateOne({ _id: otpRecord._id, isUsed: false }, { $set: { isUsed: true } });
  return true;
}

module.exports = {
  createOTP,
  verifyOTP,
  generateOTP,
};
