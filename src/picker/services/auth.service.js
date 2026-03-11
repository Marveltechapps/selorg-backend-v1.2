/**
 * Auth service – OTP flow from HHD device backend.
 * Uses picker/services/sms.service (multi-provider: config → MSG91 → Fast2SMS → Twilio) for SMS.
 * Dev/test OTP and generateOTP from utils/smsGateway. OTP storage via picker/services/otp.service.
 * DEV MODE (config/OTP_DEV_MODE): no SMS, OTP in response. PRODUCTION: send via sms.service, store in picker_otps.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const HHDUser = require('../../hhd/models/User.model');
const { createOTP, verifyOTP } = require('./otp.service');
const { sendOtpSms } = require('./sms.service');
const { isOtpDevMode, getTestOtpIfApplicable, generateOTP } = require('../../utils/smsGateway');
const { OTP_ERROR_CODES } = require('../config/otp.constants');

const JWT_SECRET = process.env.JWT_SECRET || 'picker-app-secret-change-in-production';

/** Normalize phone: digits only, exactly 10 digits, not all zeros. */
function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length !== 10 || /^0+$/.test(digits)) return null;
  return digits;
}

/** Log helper – avoid require in hot path if logger missing */
function logPickerOtp(level, msg) {
  try {
    const { logger } = require('../../hhd/utils/logger');
    if (level === 'info') logger.info(msg);
    else if (level === 'warn') logger.warn(msg);
  } catch (_) {
    console.log(`[Picker OTP] ${msg}`);
  }
}

async function ensureLinkedHhdUser(pickerUser, normalizedPhone) {
  if (!pickerUser || !/^[6-9]\d{9}$/.test(normalizedPhone)) {
    return null;
  }

  let hhdUser = await HHDUser.findOne({ mobile: normalizedPhone });
  if (!hhdUser) {
    hhdUser = await HHDUser.create({ mobile: normalizedPhone, isActive: true });
  }

  if (!pickerUser.hhdUserId || pickerUser.hhdUserId.toString() !== hhdUser._id.toString()) {
    pickerUser.hhdUserId = hhdUser._id;
    await pickerUser.save();
  }

  return hhdUser;
}

/**
 * Send OTP – HHD flow: validate mobile, get test OTP or generate; dev mode: createOTP and return OTP; else send SMS then createOTP.
 */
const sendOtp = async (phone) => {
  if (phone === undefined || phone === null) {
    return { success: false, message: 'Phone number is required', errorCode: OTP_ERROR_CODES.INVALID_PHONE };
  }

  const trimmed = normalizePhone(phone);
  if (!trimmed) {
    return { success: false, message: 'Please provide a valid 10-digit mobile number.', errorCode: OTP_ERROR_CODES.INVALID_PHONE };
  }

  const testOtp = getTestOtpIfApplicable(trimmed);
  const otp = testOtp || generateOTP();

  if (isOtpDevMode()) {
    logPickerOtp('info', `[Picker OTP] sendOtp: dev mode ON – skipping SMS for ${trimmed}, OTP returned in response`);
    try {
      await createOTP(trimmed, otp);
    } catch (e) {
      return { success: false, message: 'Failed to store OTP. Please try again.', errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR };
    }
    return { success: true, message: 'OTP sent successfully', otp };
  }

  logPickerOtp('info', `[Picker OTP] sendOtp: sending SMS to ${trimmed} via gateway, OTP: ${otp}`);
  const smsResult = await sendOtpSms(trimmed, otp);
  logPickerOtp('info', `[Picker OTP] sendOtp: SMS result - sent: ${smsResult.sent}, internalLog: ${smsResult.internalLog || 'N/A'}`);
  if (!smsResult.sent) {
    logPickerOtp('warn', `[Picker OTP] sendOtp: SMS failed for ${trimmed} – ${smsResult.userMessage || ''} ${smsResult.internalLog || ''}`);
    return {
      success: false,
      message: smsResult.userMessage || 'Failed to send OTP via SMS. Please try again.',
      errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR,
    };
  }
  logPickerOtp('info', `[Picker OTP] sendOtp: SMS accepted by gateway for ${trimmed}, OTP: ${otp}`);

  try {
    await createOTP(trimmed, otp);
  } catch (e) {
    return { success: false, message: 'OTP could not be stored. Please try again.', errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR };
  }

  return {
    success: true,
    message: 'OTP sent successfully',
    ...(isOtpDevMode() && { otp }),           // Dev mode: return OTP (no SMS)
    ...(testOtp && { otp: testOtp }),         // Test numbers (e.g. 9698790921): return fixed OTP (no SMS)
  };
};

/**
 * Resend OTP – same as send (HHD treats resend as send).
 */
const resendOtp = async (phone) => {
  return sendOtp(phone);
};

/**
 * Verify OTP – HHD flow: verifyOTP then find/create user, return JWT and user.
 */
const verifyOtp = async (phone, otp) => {
  if (phone === undefined || phone === null || otp === undefined || otp === null) {
    return { success: false, message: 'Phone and OTP are required' };
  }
  const otpStr = String(otp).trim();
  if (!otpStr || !/^\d{4}$/.test(otpStr)) {
    return { success: false, message: 'OTP must be exactly 4 numeric digits', errorCode: OTP_ERROR_CODES.INCORRECT_OTP };
  }

  const trimmed = normalizePhone(phone);
  if (!trimmed) {
    return { success: false, message: 'Invalid phone number. Enter a valid 10-digit mobile number.', errorCode: OTP_ERROR_CODES.INVALID_PHONE };
  }

  let isValid;
  try {
    isValid = await verifyOTP(trimmed, otpStr);
  } catch (err) {
    return { success: false, message: 'Verification failed. Please try again.' };
  }

  if (!isValid) {
    return { success: false, message: 'Invalid or expired OTP. Please try again.', errorCode: OTP_ERROR_CODES.OTP_EXPIRED };
  }

  let user = await User.findOne({ phone: trimmed });
  const isNewUser = !user;
  if (!user) user = await User.create({ phone: trimmed });
  await ensureLinkedHhdUser(user, trimmed);

  const token = jwt.sign(
    { sub: user._id.toString(), userId: user._id.toString() },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    message: 'OTP verified',
    token,
    isNewUser,
    user: { phone: user.phone, id: user._id.toString() },
  };
};

module.exports = { sendOtp, resendOtp, verifyOtp };
