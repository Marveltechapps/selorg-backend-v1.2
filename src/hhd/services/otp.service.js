const HHDOTP = require('../models/OTP.model');
const { logger } = require('../utils/logger');
const db = require('../../config/db');

async function ensureConnection() {
  if (!db.isConnected()) {
    logger.warn('[OTP Service] MongoDB not connected, waiting...');
    try {
      await db.waitForConnection(5000);
    } catch (err) {
      throw new Error(`Database not available: ${err.message}`);
    }
  }
}

function generateOTP(retryCount = 0) {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  if (otp.length !== 4) {
    if (retryCount < 3) return generateOTP(retryCount + 1);
    return otp.padStart(4, '0').slice(0, 4);
  }
  return otp;
}

async function createOTP(mobile, otpOverride) {
  const normalizedMobile = String(mobile).trim();
  logger.info(`[OTP Service] Creating OTP for mobile: ${normalizedMobile}`);
  await ensureConnection();
  const otp = otpOverride != null ? String(otpOverride).trim() : generateOTP();
  const expiresAt = new Date();
  const expireMinutes = Math.max(1, Math.min(30, parseInt(process.env.OTP_EXPIRE_MINUTES || '5', 10)));
  expiresAt.setMinutes(expiresAt.getMinutes() + expireMinutes);

  try {
    await HHDOTP.deleteMany({ mobile: normalizedMobile, isUsed: false });
  } catch (e) {
    logger.warn(`[OTP Service] Failed to delete existing OTPs: ${e.message}`);
  }

  const otpString = String(otp).trim();
  if (!/^\d{4}$/.test(otpString)) throw new Error(`Invalid OTP format: ${otpString}`);

  const created = await Promise.race([
    HHDOTP.create({ mobile: normalizedMobile, otp: otpString, expiresAt }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Save OTP timeout')), 5000)),
  ]);
  const saved = await HHDOTP.findById(created._id);
  if (!saved) throw new Error('OTP was not saved correctly');
  logger.info(`[OTP Service] OTP created and saved: mobile=${normalizedMobile}, otp=${otpString}, expires=${expiresAt.toISOString()}`);
  return otpString;
}

async function verifyOTP(mobile, otp) {
  const normalizedMobile = String(mobile).trim();
  const normalizedOtp = String(otp).trim();
  logger.info(`[OTP Service] Verifying OTP: mobile=${normalizedMobile}, otp=${normalizedOtp}`);
  await ensureConnection();
  const currentTime = new Date();
  let otpRecord = await Promise.race([
    HHDOTP.findOne({
      mobile: normalizedMobile,
      otp: normalizedOtp,
      isUsed: false,
      expiresAt: { $gt: currentTime },
    }).sort({ createdAt: -1 }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Verify OTP timeout')), 5000)),
  ]);
  
  logger.info(`[OTP Service] Initial query result: ${otpRecord ? 'found' : 'not found'}`);

  if (!otpRecord) {
    logger.info(`[OTP Service] No direct match, checking all OTPs for mobile=${normalizedMobile}`);
    const allOtps = await HHDOTP.find({ mobile: normalizedMobile }).sort({ createdAt: -1 }).limit(5);
    logger.info(`[OTP Service] Found ${allOtps.length} OTP records for this mobile`);
    
    allOtps.forEach((r, idx) => {
      logger.info(`[OTP Service] Record ${idx + 1}: otp=${r.otp}, isUsed=${r.isUsed}, expiresAt=${r.expiresAt.toISOString()}, expired=${r.expiresAt <= currentTime}`);
    });
    
    const validOtps = allOtps.filter((r) => !r.isUsed && r.expiresAt > currentTime);
    logger.info(`[OTP Service] Valid (unused + not expired) OTPs: ${validOtps.length}`);
    
    for (const record of validOtps) {
      const recordOtp = String(record.otp).trim();
      logger.info(`[OTP Service] Comparing: stored="${recordOtp}" vs entered="${normalizedOtp}"`);
      if (recordOtp === normalizedOtp) {
        logger.info(`[OTP Service] String match found!`);
        otpRecord = record;
        break;
      }
      const rNum = parseInt(recordOtp, 10);
      const pNum = parseInt(normalizedOtp, 10);
      if (!isNaN(rNum) && !isNaN(pNum) && rNum === pNum) {
        logger.info(`[OTP Service] Numeric match found!`);
        otpRecord = record;
        break;
      }
    }
  }

  if (!otpRecord) {
    logger.warn(`[OTP Service] Verification failed: No valid OTP found for mobile=${normalizedMobile}, entered OTP=${normalizedOtp}`);
    return false;
  }
  
  logger.info(`[OTP Service] OTP match found, marking as used`);
  await Promise.race([
    HHDOTP.updateOne({ _id: otpRecord._id, isUsed: false }, { $set: { isUsed: true } }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Mark OTP timeout')), 5000)),
  ]);
  return true;
}

module.exports = {
  OTPService: { generateOTP, createOTP, verifyOTP },
  createOTP,
  verifyOTP,
};
