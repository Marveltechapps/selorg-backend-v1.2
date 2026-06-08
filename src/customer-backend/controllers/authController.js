const { OtpSession } = require('../models/OtpSession');
const { CustomerUser } = require('../models/CustomerUser');
const { generateOtp, hashOtp, verifyOtp, getExpiryDate } = require('../utils/otpUtils');
const { sendSms } = require('../services/otpProviderService');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AuditLog = require('../../common-models/AuditLog');
const websocketService = require('../../utils/websocket');
const { getSmsMessageTemplate, isOtpDevMode } = require('../../picker/config/otp.config');

const CUSTOMER_APP_NAME = process.env.CUSTOMER_APP_NAME || 'Selorg Customer';
const CUSTOMER_OTP_MESSAGE =
  process.env.CUSTOMER_OTP_WHATSAPP_MESSAGE ||
  process.env.CUSTOMER_OTP_SMS_MESSAGE ||
  'Selorg Customer verification code is {otp}. Valid for 5 minutes. Do not share.';

const JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod';
const ACCESS_EXPIRES_SECONDS = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS) || 60 * 60 * 24;
const OTP_EXPIRY_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 30;

/** Matches default in src/config.json smsMessageTemplate when template is empty. */
const CUSTOMER_SMS_TEMPLATE_FALLBACK =
  'Dear Applicant, Your OTP for Mobile No. Verification is {otp}. MJPTBCWREIS - EVOLGN';
const TEST_MOBILE = '9698790921';
const TEST_OTP = '8790';

function generateSecurePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function buildCustomerOtpSms(otp) {
  const tpl = getSmsMessageTemplate();
  const base = tpl && String(tpl).trim().length > 0 ? tpl : CUSTOMER_SMS_TEMPLATE_FALLBACK;
  return String(base).replace(/{otp}/g, otp).replace(/\{#var#\}/g, otp);
}

function buildBrandedOtpMessage(otp) {
  return String(CUSTOMER_OTP_MESSAGE).replace(/{otp}/g, otp);
}

function clientDeliveryFailureMessage(raw, fallback) {
  const s = String(raw || '').trim();
  if (!s || s.startsWith('[') || s.length > 220) return fallback;
  return s;
}

function loadPickerSmsService() {
  try {
    return require('../../picker/services/sms.service');
  } catch (_) {
    return null;
  }
}

function loadPickerEmailService() {
  try {
    return require('../../picker/services/emailOtp.service');
  } catch (_) {
    return null;
  }
}

function customerEmailFromAddress() {
  return (
    process.env.CUSTOMER_RESEND_FROM ||
    process.env.CUSTOMER_EMAIL_FROM ||
    process.env.CUSTOMER_RESEND_VERIFIED_FROM ||
    null
  );
}

function deliverWithCustomerBranding(promiseFactory) {
  const pickerSms = loadPickerSmsService();
  if (pickerSms && typeof pickerSms.withOtpMessageTemplate === 'function') {
    return pickerSms.withOtpMessageTemplate(CUSTOMER_OTP_MESSAGE, promiseFactory);
  }
  return promiseFactory();
}

async function deliverOtpToPhone(digits, otp, channel) {
  const wantsWhatsApp = String(channel || 'sms').toLowerCase() === 'whatsapp';
  const pickerSms = loadPickerSmsService();

  async function trySms() {
    if (isOtpDevMode()) {
      console.log(`[sendOtp] otpDevMode: skipping SMS; enter OTP from server logs for ${digits}`);
      return { success: true, body: 'otp-dev-mode-no-sms', channel: 'sms' };
    }
    const message = buildBrandedOtpMessage(otp);
    const result = await deliverWithCustomerBranding(async () => {
      if (pickerSms && typeof pickerSms.sendOtpSms === 'function') {
        const smsResult = await pickerSms.sendOtpSms(digits, otp);
        if (smsResult && smsResult.sent) {
          return { success: true, body: smsResult.channel || 'sms', channel: smsResult.channel || 'sms' };
        }
      }
      const providerResult = await sendSms({ to: digits, text: message || buildCustomerOtpSms(otp) });
      return {
        success: !!(providerResult && providerResult.success),
        body: providerResult?.body,
        error: providerResult?.error,
        channel: 'sms',
      };
    });
    return result;
  }

  if (wantsWhatsApp && pickerSms && typeof pickerSms.sendOtpWhatsApp === 'function') {
    const waResult = await deliverWithCustomerBranding(async () => {
      const result = await pickerSms.sendOtpWhatsApp(digits, otp);
      if (result && result.sent) {
        return { success: true, channel: result.channel || 'whatsapp' };
      }
      return trySms();
    });
    return waResult;
  }

  return trySms();
}

async function deliverOtpToEmail(email, otp) {
  const pickerEmail = loadPickerEmailService();
  const expireMinutes = Math.max(1, Math.floor(OTP_EXPIRY_SECONDS / 60));
  const from = customerEmailFromAddress() || undefined;

  if (
    pickerEmail &&
    typeof pickerEmail.sendPickerEmailOtp === 'function' &&
    pickerEmail.isEmailOtpConfigured &&
    pickerEmail.isEmailOtpConfigured()
  ) {
    const result = await pickerEmail.sendPickerEmailOtp({
      to: email,
      otp,
      expiresInMinutes: expireMinutes,
      appName: CUSTOMER_APP_NAME,
      from,
    });
    return {
      success: !!(result && result.sent),
      channel: (result && result.channel) || 'email',
      error: result?.userMessage || result?.internalError,
      provider: result?.provider,
    };
  }

  if (isOtpDevMode() || process.env.NODE_ENV === 'development') {
    console.info('\x1b[36m%s\x1b[0m', '----------------------------------------');
    console.info('\x1b[36m%s\x1b[0m', `DEVELOPMENT ${CUSTOMER_APP_NAME.toUpperCase()} EMAIL OTP`);
    console.info('\x1b[36m%s\x1b[0m', `Subject: ${CUSTOMER_APP_NAME} – Your verification code`);
    console.info('\x1b[36m%s\x1b[0m', `Email: ${email}`);
    console.info('\x1b[36m%s\x1b[0m', `OTP: ${otp}`);
    console.info('\x1b[36m%s\x1b[0m', '----------------------------------------');
    return { success: true, channel: 'email' };
  }

  return {
    success: false,
    error: 'Email OTP is not configured on the server. Please use Mobile or WhatsApp login.',
  };
}

async function sendEmailOtpFlow(normalizedEmail, res) {
  const pickerEmail = loadPickerEmailService();
  const emailConfigured =
    pickerEmail &&
    typeof pickerEmail.isEmailOtpConfigured === 'function' &&
    pickerEmail.isEmailOtpConfigured();
  const allowDevFallback = isOtpDevMode() || process.env.NODE_ENV === 'development';

  if (!emailConfigured && !allowDevFallback) {
    return res.status(503).json({
      success: false,
      message: 'Email OTP is not configured on the server. Please use Mobile or WhatsApp login.',
      internalCode: 'EMAIL_NOT_CONFIGURED',
    });
  }

  const otp = generateOtp(4);
  console.log(`[sendOtp] Generated email OTP for ${normalizedEmail}: ${otp}`);

  // Picker pattern: start delivery, persist OTP, then confirm delivery result.
  const mailPromise = emailConfigured
    ? deliverOtpToEmail(normalizedEmail, otp)
    : Promise.resolve({ success: true, channel: 'email' });

  let sessionId;
  try {
    sessionId = await createOtpSession({
      email: normalizedEmail,
      otp,
      channel: 'email',
    });
  } catch (storeErr) {
    console.error('[sendOtp] Failed to store email OTP session', storeErr);
    return res.status(500).json({
      success: false,
      message: 'Failed to store OTP. Please try again.',
    });
  }

  const providerResult = await mailPromise;
  if (!providerResult || !providerResult.success) {
    const errorMsg =
      providerResult?.error || 'Failed to send OTP email. Please try again.';
    console.error(`[sendOtp] Email provider failed for ${normalizedEmail}: ${errorMsg}`);
    return res.status(500).json({
      success: false,
      message: clientDeliveryFailureMessage(errorMsg, 'Failed to send OTP via email'),
      internalCode: 'EMAIL_PROVIDER_ERROR',
      details: process.env.NODE_ENV === 'development' ? errorMsg : undefined,
    });
  }

  console.log(
    `[sendOtp] Email OTP accepted for ${normalizedEmail} via ${providerResult.provider || providerResult.channel || 'email'}`
  );

  return res.status(200).json({
    success: true,
    sessionId,
    channel: providerResult.channel || 'email',
    resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    message:
      'OTP sent successfully' +
      (allowDevFallback && !emailConfigured ? ' (check backend console for OTP)' : ''),
  });
}

async function createOtpSession({ phoneNumber, email, otp, channel, providerResponseId }) {
  const sessionId = crypto.randomUUID();
  await OtpSession.create({
    sessionId,
    phoneNumber: phoneNumber || null,
    email: email || null,
    otpHash: hashOtp(otp),
    channel,
    otpSentAt: new Date(),
    otpExpiresAt: getExpiryDate(OTP_EXPIRY_SECONDS),
    resendCount: 0,
    attemptCount: 0,
    verified: false,
    providerResponseId: providerResponseId ? String(providerResponseId).slice(0, 255) : undefined,
  });
  return sessionId;
}

async function sendOtp(req, res) {
  try {
    const { phoneNumber, email, channel: rawChannel, preferredChannel } = req.body;
    const channel = String(preferredChannel || rawChannel || 'sms').toLowerCase();

    if (email || channel === 'email') {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        res.status(400).json({ success: false, message: 'Valid email address required' });
        return;
      }
      return sendEmailOtpFlow(normalizedEmail, res);
    }

    if (!phoneNumber) {
      res.status(400).json({ success: false, message: 'phoneNumber or email required' });
      return;
    }

    const digits = normalizePhone(phoneNumber);
    if (digits.length !== 10 || /^0+$/.test(digits)) {
      res.status(400).json({ success: false, message: 'phoneNumber must be exactly 10 digits' });
      return;
    }

    const otp = digits === TEST_MOBILE ? TEST_OTP : generateOtp(4);
    console.log(`[sendOtp] Generated OTP for ${digits}: ${otp}`);

    const providerResult = await deliverOtpToPhone(digits, otp, channel);
    if (!providerResult || !providerResult.success) {
      const errorMsg = providerResult?.error || 'SMS provider unavailable';
      console.error(`[sendOtp] Provider failed for ${digits}: ${errorMsg}`);
      const clientMsg = clientDeliveryFailureMessage(errorMsg, 'Failed to send OTP');
      return res.status(500).json({
        success: false,
        message: clientMsg,
        internalCode: 'OTP_PROVIDER_ERROR',
        details: process.env.NODE_ENV === 'development' ? errorMsg : undefined,
      });
    }

    const deliveredChannel = providerResult.channel || (channel === 'whatsapp' ? 'whatsapp' : 'sms');
    console.log(`[sendOtp] OTP successfully sent to ${digits} via ${deliveredChannel}`);

    const sessionId = await createOtpSession({
      phoneNumber: digits,
      otp,
      channel: deliveredChannel,
      providerResponseId: providerResult.body,
    });

    res.status(200).json({
      success: true,
      sessionId,
      channel: deliveredChannel,
      resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    });
  } catch (err) {
    console.error('sendOtp error', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function upsertCustomerUser(session) {
  const now = new Date();
  const fallbackEmail = `no-email-${Date.now()}-${Math.floor(Math.random() * 100000)}@no-email.selorg`;
  const isEmailLogin = !!session.email;

  let existingUser;
  if (isEmailLogin) {
    existingUser = await CustomerUser.findOne({ email: session.email }).lean();
  } else {
    existingUser = await CustomerUser.findOne({ phoneNumber: session.phoneNumber }).lean();
  }
  const isNewUser = !existingUser;

  const filter = isEmailLogin ? { email: session.email } : { phoneNumber: session.phoneNumber };
  const setFields = isEmailLogin
    ? { lastLogin: now }
    : { phoneVerified: true, phoneVerifiedAt: now, lastLogin: now };
  const insertFields = isEmailLogin
    ? {
        email: session.email,
        status: 'active',
      }
    : {
        phoneNumber: session.phoneNumber,
        email: fallbackEmail,
        status: 'active',
      };

  let user;
  try {
    user = await CustomerUser.findOneAndUpdate(
      filter,
      {
        $set: setFields,
        $inc: { loginCount: 1 },
        $setOnInsert: insertFields,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (err) {
    const isDup = err && (err.code === 11000 || err.code === 'E11000');
    if (isDup) {
      user = await CustomerUser.findOne(filter).lean();
      if (!user) {
        const created = await CustomerUser.create({
          ...insertFields,
          lastLogin: now,
          loginCount: 1,
        });
        user = created.toObject ? created.toObject() : created;
      }
    } else {
      throw err;
    }
  }

  return { user, isNewUser };
}

async function verifyOtpController(req, res) {
  try {
    const { sessionId, otp } = req.body;
    if (!sessionId || !otp) {
      res.status(400).json({ success: false, message: 'sessionId and otp required' });
      return;
    }
    const session = await OtpSession.findOne({ sessionId });
    if (!session) {
      res.status(400).json({ success: false, message: 'Invalid session' });
      return;
    }
    if (session.verified) {
      res.status(400).json({ success: false, message: 'OTP already used' });
      return;
    }
    if (session.otpExpiresAt && session.otpExpiresAt < new Date()) {
      res.status(400).json({ success: false, message: 'OTP expired' });
      return;
    }
    const ok = verifyOtp(otp, session.otpHash);
    session.attemptCount = (session.attemptCount || 0) + 1;
    await session.save();
    if (!ok) {
      res.status(400).json({ success: false, message: 'Invalid OTP' });
      return;
    }
    session.verified = true;
    session.verifiedAt = new Date();
    await session.save();

    const { user, isNewUser } = await upsertCustomerUser(session);
    const now = new Date();

    let autoGeneratedPassword = null;
    if (isNewUser) {
      try {
        const plainPassword = generateSecurePassword(8);
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        await CustomerUser.updateOne(
          { _id: user._id },
          {
            $set: {
              passwordHash,
              autoGeneratedPassword: plainPassword,
              isPasswordAutoGenerated: true,
              passwordLastChangedAt: now,
              passwordLastChangedBy: 'system',
            },
          }
        );
        autoGeneratedPassword = plainPassword;
      } catch (pwErr) {
        console.warn('Auto-generate password failed (non-blocking)', pwErr?.message);
      }
    }

    try {
      await AuditLog.create({
        module: 'customer',
        action: isNewUser ? 'USER_REGISTERED' : 'USER_LOGIN',
        entityType: 'CustomerUser',
        entityId: String(user._id),
        severity: 'info',
        details: {
          phoneNumber: user.phoneNumber,
          email: user.email,
          channel: session.channel,
          isNewUser,
        },
        ipAddress: req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim(),
        userAgent: req.get?.('user-agent'),
      });
    } catch (auditErr) {
      console.warn('AuditLog create failed (non-blocking)', auditErr?.message);
    }

    try {
      const wsEvent = isNewUser ? 'customer:registered' : 'customer:login';
      websocketService.broadcastToRole('admin', wsEvent, {
        userId: String(user._id),
        phoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name || null,
        timestamp: now.toISOString(),
      });
    } catch (wsErr) {
      console.warn('WebSocket broadcast failed (non-blocking)', wsErr?.message);
    }

    const payload = { sub: String(user._id), phoneNumber: user.phoneNumber, email: user.email };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES_SECONDS });
    const responseData = {
      accessToken,
      isNewUser,
      user: {
        _id: String(user._id),
        phoneNumber: user.phoneNumber,
        email: user.email,
        phoneVerified: user.phoneVerified,
      },
    };
    if (isNewUser && autoGeneratedPassword) {
      responseData.autoGeneratedPassword = autoGeneratedPassword;
    }
    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    console.error('verifyOtp error', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function resendOtp(req, res) {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ success: false, message: 'sessionId required' });
      return;
    }
    const session = await OtpSession.findOne({ sessionId });
    if (!session) {
      res.status(400).json({ success: false, message: 'Invalid session' });
      return;
    }
    if (session.verified) {
      res.status(400).json({ success: false, message: 'OTP already used' });
      return;
    }
    if (session.otpSentAt && Date.now() - session.otpSentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      res.status(429).json({ success: false, message: 'Resend cooldown active' });
      return;
    }

    const channel = String(session.channel || 'sms').toLowerCase();
    const otp =
      session.phoneNumber && normalizePhone(session.phoneNumber) === TEST_MOBILE ? TEST_OTP : generateOtp(4);

    console.log(`[resendOtp] Generated OTP for ${session.email || session.phoneNumber}: ${otp}`);

    let providerResult;
    if (channel === 'email' && session.email) {
      providerResult = await deliverOtpToEmail(session.email, otp);
    } else {
      const digits = normalizePhone(session.phoneNumber);
      providerResult = await deliverOtpToPhone(digits, otp, channel);
    }

    if (!providerResult || !providerResult.success) {
      const errorMsg = providerResult?.error || 'OTP provider unavailable';
      console.error(`[resendOtp] Provider failed: ${errorMsg}`);
      const clientMsg = clientDeliveryFailureMessage(errorMsg, 'Failed to resend OTP');
      return res.status(500).json({
        success: false,
        message: clientMsg,
        internalCode: 'OTP_PROVIDER_ERROR',
        details: process.env.NODE_ENV === 'development' ? errorMsg : undefined,
      });
    }

    session.otpHash = hashOtp(otp);
    session.otpSentAt = new Date();
    session.otpExpiresAt = getExpiryDate(OTP_EXPIRY_SECONDS);
    session.resendCount = (session.resendCount || 0) + 1;
    if (providerResult.body) session.providerResponseId = String(providerResult.body).slice(0, 255);
    if (providerResult.channel) session.channel = providerResult.channel;
    await session.save();

    res.status(200).json({
      success: true,
      channel: session.channel,
      resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    });
  } catch (err) {
    console.error('resendOtp error', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { sendOtp, verifyOtpController, resendOtp };
