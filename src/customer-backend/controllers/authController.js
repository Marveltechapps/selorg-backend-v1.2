const { OtpSession } = require('../models/OtpSession');
const { CustomerUser } = require('../models/CustomerUser');
const { generateOtp, hashOtp, verifyOtp, getExpiryDate } = require('../utils/otpUtils');
const { sendSms } = require('../services/otpProviderService');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AuditLog = require('../../common-models/AuditLog');
const websocketService = require('../../utils/websocket');

function generateSecurePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

const JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod';
const ACCESS_EXPIRES_SECONDS = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS) || 60 * 60 * 24;

/** Per OTP_PROCESS_WORKFLOW.md */
const SIGNIN_SMS_MESSAGE = 'Dear Applicant, Your OTP for Mobile No. Verification is {otp} . MJPTBCWREIS - EVOLGN';
const TEST_MOBILE = '9698790921';
const TEST_OTP = '8790';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

async function sendOtp(req, res) {
  try {
    const { phoneNumber, channel = 'sms' } = req.body;
    if (!phoneNumber) {
      res.status(400).json({ success: false, message: 'phoneNumber required' });
      return;
    }
    const digits = normalizePhone(phoneNumber);
    if (digits.length !== 10 || /^0+$/.test(digits)) {
      res.status(400).json({ success: false, message: 'phoneNumber must be exactly 10 digits' });
      return;
    }
    const otp = digits === TEST_MOBILE ? TEST_OTP : generateOtp(4);
    const message = SIGNIN_SMS_MESSAGE.replace(/{otp}/g, otp);
    const providerResult = await sendSms({ to: digits, text: message });

    if (!providerResult || !providerResult.success) {
      return res.status(500).json({ success: false, message: 'Failed to send OTP via SMS' });
    }

    const otpHash = hashOtp(otp);
    const expiresAt = getExpiryDate(300); // 5 min per workflow
    const sessionId = crypto.randomUUID();
    await OtpSession.create({
      sessionId,
      phoneNumber: digits,
      otpHash,
      channel,
      otpSentAt: new Date(),
      otpExpiresAt: expiresAt,
      resendCount: 0,
      attemptCount: 0,
      verified: false,
      providerResponseId: providerResult.body ? String(providerResult.body).slice(0, 255) : undefined,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('[dev] OTP for', digits, ':', otp);
    }

    res.status(200).json({
      success: true,
      sessionId,
      resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 30,
    });
  } catch (err) {
    console.error('sendOtp error', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
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

    const now = new Date();
    let user;
    const fallbackEmail = `no-email-${Date.now()}-${Math.floor(Math.random() * 100000)}@no-email.selorg`;

    const existingUser = await CustomerUser.findOne({ phoneNumber: session.phoneNumber }).lean();
    const isNewUser = !existingUser;

    try {
      user = await CustomerUser.findOneAndUpdate(
        { phoneNumber: session.phoneNumber },
        {
          $set: { phoneVerified: true, phoneVerifiedAt: now, lastLogin: now },
          $inc: { loginCount: 1 },
          $setOnInsert: {
            phoneNumber: session.phoneNumber,
            email: fallbackEmail,
            status: 'active',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
    } catch (err) {
      const isDup = err && (err.code === 11000 || err.code === 'E11000' || (err.errmsg && typeof err.errmsg === 'string' && err.errmsg.includes('E11000')));
      const isStrictModeError = err && (err.name === 'StrictModeError' || (err.message && typeof err.message === 'string' && err.message.includes('strict mode')));
      if (isDup) {
        user = await CustomerUser.findOne({ phoneNumber: session.phoneNumber }).lean();
        if (!user) {
          const created = await CustomerUser.create({
            phoneNumber: session.phoneNumber,
            email: `no-email-${Date.now()}@no-email.selorg`,
            phoneVerified: true,
            phoneVerifiedAt: now,
            lastLogin: now,
            loginCount: 1,
            status: 'active',
          });
          user = created.toObject ? created.toObject() : created;
        }
      } else if (isStrictModeError) {
        const coll = CustomerUser.collection;
        const result = await coll.findOneAndUpdate(
          { phoneNumber: session.phoneNumber },
          {
            $set: { phoneVerified: true, phoneVerifiedAt: now, lastLogin: now },
            $inc: { loginCount: 1 },
            $setOnInsert: {
              phoneNumber: session.phoneNumber,
              email: fallbackEmail,
              status: 'active',
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
        user = result && result.value ? JSON.parse(JSON.stringify(result.value)) : null;
        if (!user) {
          const created = await CustomerUser.create({
            phoneNumber: session.phoneNumber,
            email: fallbackEmail,
            phoneVerified: true,
            phoneVerifiedAt: now,
            lastLogin: now,
            loginCount: 1,
            status: 'active',
          });
          user = created.toObject ? created.toObject() : created;
        }
      } else {
        throw err;
      }
    }

    // Auto-generate password for new users
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

    // Best-effort audit log + WebSocket broadcast (never block auth flow)
    try {
      await AuditLog.create({
        module: 'customer',
        action: isNewUser ? 'USER_REGISTERED' : 'USER_LOGIN',
        entityType: 'CustomerUser',
        entityId: String(user._id),
        severity: 'info',
        details: { phoneNumber: user.phoneNumber, isNewUser },
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
        name: user.name || null,
        timestamp: now.toISOString(),
      });
    } catch (wsErr) {
      console.warn('WebSocket broadcast failed (non-blocking)', wsErr?.message);
    }

    const payload = { sub: String(user._id), phoneNumber: user.phoneNumber };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES_SECONDS });
    const responseData = {
      accessToken,
      isNewUser,
      user: {
        _id: String(user._id),
        phoneNumber: user.phoneNumber,
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
    const cooldown = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 30;
    if (session.otpSentAt && Date.now() - session.otpSentAt.getTime() < cooldown * 1000) {
      res.status(429).json({ success: false, message: 'Resend cooldown active' });
      return;
    }
    const digits = normalizePhone(session.phoneNumber);
    const otp = digits === TEST_MOBILE ? TEST_OTP : generateOtp(4);
    const message = SIGNIN_SMS_MESSAGE.replace(/{otp}/g, otp);
    const providerResult = await sendSms({ to: digits, text: message });

    if (!providerResult || !providerResult.success) {
      return res.status(500).json({ success: false, message: 'Failed to resend OTP via SMS' });
    }

    session.otpHash = hashOtp(otp);
    session.otpSentAt = new Date();
    session.otpExpiresAt = getExpiryDate(300);
    session.resendCount = (session.resendCount || 0) + 1;
    if (providerResult.body) session.providerResponseId = String(providerResult.body).slice(0, 255);
    await session.save();

    res.status(200).json({ success: true, resendCooldownSeconds: cooldown });
  } catch (err) {
    console.error('resendOtp error', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { sendOtp, verifyOtpController, resendOtp };
