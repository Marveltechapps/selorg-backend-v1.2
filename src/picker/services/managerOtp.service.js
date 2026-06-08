/**
 * HSD device request / manager approval OTP.
 * Generated when picker requests approval; displayed on Admin Operations Dashboard picker list.
 */
const crypto = require('crypto');
const PickerUser = require('../models/user.model');
const WorkLocation = require('../models/workLocation.model');
const ManagerOTP = require('../models/ManagerOTP');
const pickerApprovalService = require('./pickerApproval.service');
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

function shouldSendManagerSms() {
  return String(process.env.MANAGER_OTP_SEND_SMS || '').toLowerCase() === 'true';
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

/**
 * Active OTP codes for admin picker list (pickerId -> { otp, expiresAt }).
 */
async function getActiveDeviceRequestOtpsByPickerIds(pickerIds) {
  const ids = (pickerIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (!ids.length) return {};

  const now = new Date();
  const rows = await ManagerOTP.find({
    pickerId: { $in: ids },
    used: false,
    expiresAt: { $gt: now },
  })
    .select('pickerId otpCode expiresAt createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const map = {};
  for (const row of rows) {
    const key = String(row.pickerId);
    if (map[key]) continue;
    map[key] = {
      otp: row.otpCode,
      expiresAt: row.expiresAt,
    };
  }
  return map;
}

async function requestManagerOtp(pickerId, options = {}) {
  const picker = await PickerUser.findById(pickerId);
  if (!picker) {
    const err = new Error('Picker not found');
    err.statusCode = 404;
    throw err;
  }

  const forceNew = options?.forceNew === true;

  // If there is already an active OTP, do not overwrite it.
  // This keeps the supervisor-generated OTP valid when the picker presses
  // "Request Approval OTP" before verifying.
  const existing = await ManagerOTP.findOne({
    pickerId,
    used: false,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (existing && !forceNew) {
    const existingOtpCode = String(existing.otpCode);
    const remainingMs =
      new Date(existing.expiresAt).getTime() - Date.now();
    const expiresInMinutes = Math.max(0, Math.ceil(remainingMs / 60000));

    const managerPhone =
      existing.managerPhone || (await resolveManagerPhoneForPicker(picker));

    const response = {
      success: true,
      message:
        'Approval OTP is already active. Your supervisor can read the code from the Admin Operations Dashboard.',
      expiresInMinutes,
    };

    if (isOtpDevMode()) {
      response.devOtp = existingOtpCode;
    }

    if (shouldSendManagerSms() && managerPhone) {
      const smsResult = await sendOtpSms(managerPhone, existingOtpCode);
      if (!smsResult.sent) {
        const err = new Error(
          smsResult.userMessage || 'Failed to send OTP to manager'
        );
        err.statusCode = 502;
        throw err;
      }
      response.maskedPhone = maskPhone10(managerPhone);
      response.message =
        'OTP sent to your manager and is visible on the Admin Operations Dashboard.';
    }

    return response;
  }

  const plainOtp = generateSixDigitOtp();
  const otpHash = hashOtp(String(pickerId), plainOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const managerPhone = await resolveManagerPhoneForPicker(picker);

  await ManagerOTP.deleteMany({ pickerId, used: false });
  await ManagerOTP.create({
    pickerId,
    otpCode: plainOtp,
    otpHash,
    expiresAt,
    used: false,
    managerPhone: managerPhone || null,
  });

  const response = {
    success: true,
    message:
      'Approval OTP generated. Your supervisor can read the code from the Admin Operations Dashboard.',
    expiresInMinutes: Math.round(OTP_TTL_MS / 60000),
  };

  if (isOtpDevMode()) {
    response.devOtp = plainOtp;
  }

  if (shouldSendManagerSms() && managerPhone) {
    const smsResult = await sendOtpSms(managerPhone, plainOtp);
    if (!smsResult.sent) {
      await ManagerOTP.deleteMany({ pickerId, used: false });
      const err = new Error(smsResult.userMessage || 'Failed to send OTP to manager');
      err.statusCode = 502;
      throw err;
    }
    response.maskedPhone = maskPhone10(managerPhone);
    response.message =
      'OTP sent to your manager and is visible on the Admin Operations Dashboard.';
  }

  return response;
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
    try {
      return await pickerApprovalService.verifyApprovalLocationOtp(pickerId, { otp });
    } catch (locationErr) {
      const err = new Error(locationErr.message || 'Invalid or expired OTP');
      err.statusCode = locationErr.statusCode || 400;
      err.code = locationErr.code;
      throw err;
    }
  }

  record.used = true;
  await record.save();

  picker.managerOtpVerifiedAt = new Date();
  await picker.save();

  return { success: true, message: 'OTP verified successfully' };
}

/**
 * Generate device-request OTP for dashboard supervisors (HSD User List drawer).
 * Returns the plain 6-digit code for display to the picker.
 */
async function generateDeviceRequestOtpForDashboard(pickerId) {
  await requestManagerOtp(pickerId, { forceNew: true });
  const map = await getActiveDeviceRequestOtpsByPickerIds([pickerId]);
  const row = map[String(pickerId)] || null;
  return {
    success: true,
    otp: row?.otp || null,
    expiresAt: row?.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    expiresInMinutes: Math.round(OTP_TTL_MS / 60000),
    message: row?.otp
      ? '6-digit approval OTP generated. The picker can verify it in the Collect Device screen.'
      : 'OTP generated but could not be retrieved. Try again.',
  };
}

module.exports = {
  requestManagerOtp,
  verifyManagerOtp,
  getActiveDeviceRequestOtpsByPickerIds,
  generateDeviceRequestOtpForDashboard,
  maskPhone10,
  normalizePhone10,
};
