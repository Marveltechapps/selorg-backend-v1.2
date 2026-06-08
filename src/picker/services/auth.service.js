/**
 * Auth service – OTP flow from HHD device backend.
 * Uses picker/services/sms.service (multi-provider: config → MSG91 → Fast2SMS → Twilio) for SMS.
 * Dev/test OTP and generateOTP from utils/smsGateway. OTP storage via picker/services/otp.service.
 * DEV MODE (config/OTP_DEV_MODE): no SMS, OTP in response. PRODUCTION: send via sms.service, store in picker_otps.
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/user.model');
const HHDUser = require('../../hhd/models/User.model');
const { createOTP, verifyOTP, createEmailOTP, verifyEmailOTP, normalizeEmail } = require('./otp.service');
const { sendOtpSms, sendOtpWhatsApp } = require('./sms.service');
const { sendPickerEmailOtp, isEmailOtpConfigured } = require('./emailOtp.service');
const { isOtpDevMode, getTestOtpIfApplicable, generateOTP } = require('../../utils/smsGateway');
const { OTP_ERROR_CODES } = require('../config/otp.constants');
const pickerDarkStoreService = require('./pickerDarkStore.service');
const pickerLocationOtpService = require('./pickerLocationOtp.service');
const hsdUserLoginService = require('../../darkstore/services/hsdUserLogin.service');

const JWT_SECRET = process.env.JWT_SECRET || 'picker-app-secret-change-in-production';

/** Normalize phone: handle 10-digit, 11-digit (leading 0), and 12-digit (leading 91) to return exactly 10 digits. */
function normalizePhone(phone) {
  const raw = String(phone ?? '').replace(/\D/g, '');
  let digits = raw;
  if (raw.length === 12 && raw.startsWith('91')) {
    digits = raw.slice(2);
  } else if (raw.length === 11 && raw.startsWith('0')) {
    digits = raw.slice(1);
  } else if (raw.length > 10) {
    digits = raw.slice(-10);
  }
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
const sendOtp = async (phone, options = {}) => {
  if (phone === undefined || phone === null) {
    return { success: false, message: 'Phone number is required', errorCode: OTP_ERROR_CODES.INVALID_PHONE };
  }

  const trimmed = normalizePhone(phone);
  if (!trimmed) {
    return { success: false, message: 'Please provide a valid 10-digit mobile number.', errorCode: OTP_ERROR_CODES.INVALID_PHONE };
  }

  const preferredChannel = String(options.preferredChannel || 'sms').toLowerCase();
  const isWhatsApp = preferredChannel === 'whatsapp';
  const channelLabel = isWhatsApp ? 'WhatsApp' : 'SMS';

  const testOtp = getTestOtpIfApplicable(trimmed);
  const otp = testOtp || generateOTP();

  if (isOtpDevMode()) {
    logPickerOtp('info', `[Picker OTP] sendOtp: dev mode ON – skipping ${channelLabel} for ${trimmed}, OTP returned in response`);
    try {
      await createOTP(trimmed, otp);
    } catch (e) {
      return { success: false, message: 'Failed to store OTP. Please try again.', errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR };
    }
    return {
      success: true,
      message: 'OTP sent successfully',
      channel: isWhatsApp ? 'whatsapp' : 'sms',
      otp,
    };
  }

  logPickerOtp('info', `[Picker OTP] sendOtp: sending ${channelLabel} to ${trimmed}`);
  const deliveryResult = isWhatsApp ? await sendOtpWhatsApp(trimmed, otp) : await sendOtpSms(trimmed, otp);
  const resultChannel = deliveryResult.channel || (isWhatsApp ? 'whatsapp' : 'sms');
  logPickerOtp(
    'info',
    `[Picker OTP] sendOtp: ${channelLabel} result - sent: ${deliveryResult.sent}, internalLog: ${deliveryResult.internalLog || 'N/A'}`
  );
  if (!deliveryResult.sent) {
    logPickerOtp(
      'warn',
      `[Picker OTP] sendOtp: ${channelLabel} failed for ${trimmed} – ${deliveryResult.userMessage || ''} ${deliveryResult.internalLog || ''}`
    );
    return {
      success: false,
      message:
        deliveryResult.userMessage ||
        (isWhatsApp ? 'Failed to send OTP via WhatsApp. Please try again.' : 'Failed to send OTP via SMS. Please try again.'),
      errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR,
    };
  }
  logPickerOtp('info', `[Picker OTP] sendOtp: ${channelLabel} accepted for ${trimmed}`);

  try {
    await createOTP(trimmed, otp);
  } catch (e) {
    return { success: false, message: 'OTP could not be stored. Please try again.', errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR };
  }

  return {
    success: true,
    message: 'OTP sent successfully',
    channel: resultChannel,
    ...(isOtpDevMode() && { otp }),
    ...(testOtp && { otp: testOtp }),
  };
};

/**
 * Resend OTP – same as send (HHD treats resend as send).
 */
const resendOtp = async (phone, options = {}) => {
  return sendOtp(phone, options);
};

function syntheticPhoneForEmail(email) {
  const hex = crypto.createHash('md5').update(String(email).toLowerCase()).digest('hex');
  const digits = hex.replace(/[a-f]/gi, '').slice(0, 9);
  return `1${digits.padEnd(9, '0')}`;
}

function loginMethodFromChannel(channel) {
  const c = String(channel || '').toLowerCase();
  if (c === 'whatsapp') return 'whatsapp';
  if (c === 'email') return 'email';
  return 'mobile';
}

/**
 * Send OTP to email – stores under email|{address}, delivers via SMTP/Resend-style config.
 */
const sendOtpEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { success: false, message: 'Please enter a valid email address.', errorCode: OTP_ERROR_CODES.INVALID_PHONE };
  }

  const otp = generateOTP();
  const expireMinutes = Math.max(1, Math.min(30, parseInt(process.env.OTP_EXPIRE_MINUTES || '5', 10)));

  if (!isEmailOtpConfigured()) {
    logPickerOtp('warn', '[Picker OTP] sendOtpEmail: email provider not configured');
    return {
      success: false,
      message: 'Email OTP is not configured on the server. Please use Mobile or WhatsApp login.',
      errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR,
    };
  }

  // Start SMTP/API send immediately while OTP is being stored (saves 1–3s).
  const mailPromise = sendPickerEmailOtp({ to: normalizedEmail, otp, expiresInMinutes: expireMinutes });

  try {
    await createEmailOTP(normalizedEmail, otp);
  } catch (e) {
    return { success: false, message: 'Failed to store OTP. Please try again.', errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR };
  }

  const mailResult = await mailPromise;
  if (!mailResult.sent) {
    logPickerOtp(
      'warn',
      `[Picker OTP] sendOtpEmail: email failed for ${normalizedEmail} – ${mailResult.internalError || mailResult.userMessage}`
    );
    return {
      success: false,
      message: mailResult.userMessage || 'Failed to send OTP email. Please try again.',
      errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR,
    };
  }

  logPickerOtp(
    'info',
    `[Picker OTP] sendOtpEmail: email accepted by ${mailResult.provider || 'provider'} for ${normalizedEmail}`
  );
  return {
    success: true,
    message: 'OTP sent successfully',
    channel: mailResult.channel || 'email',
  };
};

const resendOtpEmail = async (email) => sendOtpEmail(email);

/**
 * Verify OTP – HHD flow: verifyOTP then find/create user, return JWT and user.
 */
const verifyOtp = async (phone, otp, options = {}) => {
  if (phone === undefined || phone === null || otp === undefined || otp === null) {
    return { success: false, message: 'Phone and OTP are required' };
  }
  const otpStr = String(otp).trim();
  if (!otpStr || !/^\d{4}$/.test(otpStr)) {
    logPickerOtp('warn', `[Picker OTP] verifyOtp: Invalid OTP format received - otp="${otp}", trimmed="${otpStr}"`);
    return { success: false, message: 'OTP must be exactly 4 numeric digits', errorCode: OTP_ERROR_CODES.INCORRECT_OTP };
  }

  const trimmed = normalizePhone(phone);
  if (!trimmed) {
    return { success: false, message: 'Invalid phone number. Enter a valid 10-digit mobile number.', errorCode: OTP_ERROR_CODES.INVALID_PHONE };
  }

  logPickerOtp('info', `[Picker OTP] verifyOtp: Attempting verification for phone="${phone}" (normalized="${trimmed}"), otp="${otpStr}"`);

  let isValid;
  try {
    isValid = await verifyOTP(trimmed, otpStr);
    logPickerOtp('info', `[Picker OTP] verifyOtp: verifyOTP returned isValid=${isValid} for mobile=${trimmed}, otp=${otpStr}`);
  } catch (err) {
    logPickerOtp('warn', `[Picker OTP] verifyOtp: error for ${trimmed} – ${err?.message}`);
    return { success: false, message: 'Verification failed. Please try again.' };
  }

  if (!isValid) {
    logPickerOtp('warn', `[Picker OTP] verifyOtp: Verification failed - invalid or expired OTP for ${trimmed}`);
    return { success: false, message: 'Invalid or expired OTP. Please try again.', errorCode: OTP_ERROR_CODES.OTP_EXPIRED };
  }

  let user = await User.findOne({ phone: trimmed });
  const isNewUser = !user;
  const loginMethod = loginMethodFromChannel(options.preferredChannel);
  if (!user) {
    user = await User.create({ phone: trimmed, loginMethod });
  } else {
    user.loginMethod = loginMethod;
  }
  const hhdUser = await ensureLinkedHhdUser(user, trimmed);

  const sessionToken = crypto.randomUUID();
  user.sessionToken = sessionToken;
  await user.save();

  const token = jwt.sign(
    {
      sub: user._id.toString(),
      userId: user._id.toString(),
      id: user._id.toString(),
      sid: sessionToken,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  logPickerOtp('info', `[Picker OTP] verifyOtp: Success - user authenticated, token generated for ${trimmed}`);

  const storeId = pickerDarkStoreService.normalizeStoreId(
    options.storeId ?? options.locationId
  );
  let darkStoreSession = null;
  if (storeId) {
    try {
      darkStoreSession = await pickerDarkStoreService.registerPickerAtDarkStore(
        user._id,
        storeId
      );
    } catch (storeErr) {
      logPickerOtp('warn', `[Picker OTP] verifyOtp: dark store registration skipped – ${storeErr?.message}`);
      darkStoreSession = {
        error: storeErr?.message || 'Dark store registration failed',
      };
    }
  }

  try {
    await pickerLocationOtpService.ensurePickerLocationOtpStored(user._id);
  } catch (otpErr) {
    logPickerOtp('warn', `[Picker OTP] verifyOtp: location OTP ensure skipped – ${otpErr?.message}`);
  }

  if (hhdUser) {
    try {
      const resolvedStoreId =
        storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';
      await hsdUserLoginService.recordLogin({
        phoneNumber: trimmed,
        userId: hhdUser._id.toString(),
        userName: user.name || hhdUser.name || null,
        deviceId: options.deviceId || hhdUser.deviceId || null,
        storeId: resolvedStoreId,
        source: 'picker',
      });
    } catch (loginTrackErr) {
      logPickerOtp(
        'warn',
        `[Picker OTP] verifyOtp: HSD login tracking failed – ${loginTrackErr?.message}`
      );
    }
  }

  return {
    success: true,
    message: 'OTP verified',
    token,
    isNewUser,
    user: {
      phone: user.phone,
      id: user._id.toString(),
      email: user.email || null,
      loginMethod: user.loginMethod || loginMethod,
    },
    ...(darkStoreSession && { darkStoreSession }),
  };
};

/**
 * Verify email OTP – find/create user by email.
 */
const verifyOtpEmail = async (email, otp, options = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const otpStr = String(otp ?? '').trim();
  if (!normalizedEmail) {
    return { success: false, message: 'Please enter a valid email address.', errorCode: OTP_ERROR_CODES.INVALID_PHONE };
  }
  if (!otpStr || !/^\d{4}$/.test(otpStr)) {
    return { success: false, message: 'OTP must be exactly 4 numeric digits', errorCode: OTP_ERROR_CODES.INCORRECT_OTP };
  }

  let isValid;
  try {
    isValid = await verifyEmailOTP(normalizedEmail, otpStr);
  } catch (err) {
    logPickerOtp('warn', `[Picker OTP] verifyOtpEmail: error – ${err?.message}`);
    return { success: false, message: 'Verification failed. Please try again.' };
  }

  if (!isValid) {
    return { success: false, message: 'Invalid or expired OTP. Please try again.', errorCode: OTP_ERROR_CODES.OTP_EXPIRED };
  }

  let user = await User.findOne({ email: normalizedEmail });
  const isNewUser = !user;
  try {
    if (!user) {
      user = await User.create({
        phone: syntheticPhoneForEmail(normalizedEmail),
        email: normalizedEmail,
        loginMethod: 'email',
      });
    } else {
      user.loginMethod = 'email';
      if (!user.email) user.email = normalizedEmail;
      await user.save();
    }
  } catch (err) {
    logPickerOtp('warn', `[Picker OTP] verifyOtpEmail: user persist failed – ${err?.message}`);
    return {
      success: false,
      message: 'Could not complete login for this email. Please try again or contact support.',
      errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR,
    };
  }

  const sessionToken = crypto.randomUUID();
  user.sessionToken = sessionToken;
  await user.save();

  const token = jwt.sign(
    {
      sub: user._id.toString(),
      userId: user._id.toString(),
      id: user._id.toString(),
      sid: sessionToken,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    message: 'OTP verified',
    token,
    isNewUser,
    user: {
      phone: user.phone,
      email: user.email,
      id: user._id.toString(),
      loginMethod: 'email',
    },
  };
};

module.exports = { sendOtp, resendOtp, verifyOtp, sendOtpEmail, resendOtpEmail, verifyOtpEmail };
