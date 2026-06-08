/**
 * Auth controller – production-ready OTP authentication.
 * POST /auth/send-otp, POST /auth/resend-otp, POST /auth/verify-otp. Clean JSON only.
 */
const authService = require('../services/auth.service');

function isEmailChannel(body) {
  const channel = String(body?.preferredChannel ?? '').toLowerCase();
  const email = body?.email;
  return channel === 'email' || (email && !body?.phone && !body?.phoneNumber);
}

function jsonSendSuccess(res, result) {
  return res.status(200).json({
    success: true,
    message: result.message || 'OTP sent successfully',
    ...(result.channel && { channel: result.channel }),
    ...(result.otp != null && { otp: result.otp, debugOtp: result.otp }),
  });
}

function jsonSendFailure(res, result, status = 400) {
  return res.status(status).json({
    success: false,
    message: result.message,
    ...(result.errorCode && { errorCode: result.errorCode }),
  });
}

/**
 * POST /send-otp
 * Phone: { phone } or { phoneNumber, countryCode?, preferredChannel: "sms"|"whatsapp" }
 * Email: { email, preferredChannel: "email" }
 */
const sendOtp = async (req, res, next) => {
  try {
    if (isEmailChannel(req.body)) {
      const email = req.body?.email != null ? String(req.body.email).trim() : '';
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email address is required' });
      }
      const result = await authService.sendOtpEmail(email);
      if (!result.success) return jsonSendFailure(res, result);
      return jsonSendSuccess(res, result);
    }

    const raw = req.body?.phoneNumber ?? req.body?.phone;
    const phone = raw !== undefined && raw !== null ? String(raw).trim() : undefined;
    if (!phone || phone === '') {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    const preferredChannel = String(req.body?.preferredChannel ?? 'sms').toLowerCase();
    const result = await authService.sendOtp(phone, { preferredChannel });
    if (!result.success) return jsonSendFailure(res, result);
    const channel = result.channel || (preferredChannel === 'whatsapp' ? 'whatsapp' : 'sms');
    return jsonSendSuccess(res, { ...result, channel });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /resend-otp
 */
const resendOtp = async (req, res, next) => {
  try {
    if (isEmailChannel(req.body)) {
      const email = req.body?.email != null ? String(req.body.email).trim() : '';
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email address is required' });
      }
      const result = await authService.resendOtpEmail(email);
      if (!result.success) return jsonSendFailure(res, result);
      return jsonSendSuccess(res, result);
    }

    const raw = req.body?.phoneNumber ?? req.body?.phone;
    const phone = raw !== undefined && raw !== null ? String(raw).trim() : undefined;
    if (!phone || phone === '') {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    const preferredChannel = String(req.body?.preferredChannel ?? 'sms').toLowerCase();
    const result = await authService.resendOtp(phone, { preferredChannel });
    if (!result.success) return jsonSendFailure(res, result);
    const channel = result.channel || (preferredChannel === 'whatsapp' ? 'whatsapp' : 'sms');
    return jsonSendSuccess(res, { ...result, channel });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /verify-otp
 * Phone: { phone, otp } | Email: { email, otp }
 */
const verifyOtp = async (req, res, next) => {
  try {
    const rawOtp = req.body?.otp;
    const otp = rawOtp !== undefined && rawOtp !== null ? String(rawOtp).trim() : undefined;
    if (otp === undefined || otp === '') {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const rawEmail = req.body?.email;
    const email = rawEmail !== undefined && rawEmail !== null ? String(rawEmail).trim() : undefined;
    if (email) {
      const result = await authService.verifyOtpEmail(email, otp);
      if (!result.success) return jsonSendFailure(res, result);
      return res.status(200).json({
        success: true,
        message: result.message || 'OTP verified',
        ...(result.token && { token: result.token }),
        isNewUser: result.isNewUser === true,
        ...(result.user && { user: result.user }),
      });
    }

    const rawPhone = req.body?.phoneNumber ?? req.body?.phone;
    const phone = rawPhone !== undefined && rawPhone !== null ? String(rawPhone).trim() : undefined;
    if (phone === undefined || phone === '') {
      return res.status(400).json({ success: false, message: 'Phone or email and OTP are required' });
    }

    const storeId = req.body?.storeId ?? req.body?.locationId;
    const locationType = req.body?.locationType;
    const deviceId = req.body?.deviceId;
    const preferredChannel = String(req.body?.preferredChannel ?? 'sms').toLowerCase();
    const result = await authService.verifyOtp(phone, otp, {
      storeId,
      locationId: storeId,
      locationType,
      deviceId,
      preferredChannel,
    });
    if (!result.success) return jsonSendFailure(res, result);
    return res.status(200).json({
      success: true,
      message: result.message || 'OTP verified',
      ...(result.token && { token: result.token }),
      isNewUser: result.isNewUser === true,
      ...(result.user && { user: result.user }),
      ...(result.darkStoreSession && { darkStoreSession: result.darkStoreSession }),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendOtp, resendOtp, verifyOtp };
