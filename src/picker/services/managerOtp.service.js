/**
 * Manager OTP — 6-digit code to manager phone; verify unlocks device collection in app.
 */
const crypto = require('crypto');
const PickerUser = require('../models/user.model');
const WorkLocation = require('../models/workLocation.model');
const ManagerOTP = require('../models/ManagerOTP');
const { sendOtpSms } = require('./sms.service');
const { isOtpDevMode } = require('../../utils/smsGateway');

const OTP_TTL_MS = 10 * 60 * 1000;
const PEPPER = () => process.env.MANAGER_OTP_PEPPER || process.env.JWT_SECRET || 'manager-otp-pepper';

function normalizePhone10(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

function maskPhone10(phone10) {
  if (!phone10 || phone10.length < 4) return 'XXXXXXXXXX';
  return `XXXXXX${phone10.slice(-4)}`;
}

function hashOtp(pickerId, plainOtp) {
  return crypto.createHash('sha256').update(`${pickerId}:${plainOtp}:${PEPPER()}`).digest('hex');
}

function generateSixDigitOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function resolveManagerPhoneForPicker(picker) {
  const fallback = normalizePhone10(process.env.PICKER_FALLBACK_MANAGER_PHONE);
  if (picker.currentLocationId) {
    const loc = await WorkLocation.findOne({ locationId: String(picker.currentLocationId) })
      .select('managerPhone')
      .lean();
    const fromLoc = normalizePhone10(loc?.managerPhone);
    if (fromLoc) return fromLoc;
  }
  if (fallback) return fallback;
  return null;
}

async function requestManagerOtp(pickerId) {
  const picker = await PickerUser.findById(pickerId);
  if (!picker) {
    const err = new Error('Picker not found');
    err.statusCode = 404;
    throw err;
  }
  const managerPhone = await resolveManagerPhoneForPicker(picker);
  if (!managerPhone) {
    const err = new Error(
      'No manager phone configured for this work location. Ask admin to set manager phone on the hub or set PICKER_FALLBACK_MANAGER_PHONE.'
    );
    err.statusCode = 400;
    throw err;
  }

  const plainOtp = generateSixDigitOtp();
  const otpHash = hashOtp(String(pickerId), plainOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await ManagerOTP.deleteMany({ pickerId, used: false });
  await ManagerOTP.create({
    pickerId,
    otpHash,
    expiresAt,
    used: false,
    managerPhone,
  });

  if (isOtpDevMode()) {
    return {
      success: true,
      maskedPhone: maskPhone10(managerPhone),
      devOtp: plainOtp,
    };
  }

  const smsResult = await sendOtpSms(managerPhone, plainOtp);
  if (!smsResult.sent) {
    await ManagerOTP.deleteMany({ pickerId, used: false });
    const err = new Error(smsResult.userMessage || 'Failed to send OTP to manager');
    err.statusCode = 502;
    throw err;
  }

  return {
    success: true,
    maskedPhone: maskPhone10(managerPhone),
  };
}

async function verifyManagerOtp(pickerId, otpInput) {
  const otp = String(otpInput ?? '').trim();
  if (!/^\d{6}$/.test(otp)) {
    const err = new Error('OTP must be 6 digits');
    err.statusCode = 400;
    throw err;
  }

  const picker = await PickerUser.findById(pickerId);
  if (!picker) {
    const err = new Error('Picker not found');
    err.statusCode = 404;
    throw err;
  }

  const expectedHash = hashOtp(String(pickerId), otp);
  const record = await ManagerOTP.findOne({
    pickerId,
    used: false,
    expiresAt: { $gt: new Date() },
    otpHash: expectedHash,
  });

  if (!record) {
    const err = new Error('Invalid or expired OTP');
    err.statusCode = 400;
    throw err;
  }

  record.used = true;
  await record.save();

  picker.managerOtpVerifiedAt = new Date();
  await picker.save();

  return { success: true };
}

module.exports = {
  requestManagerOtp,
  verifyManagerOtp,
  maskPhone10,
  normalizePhone10,
};
