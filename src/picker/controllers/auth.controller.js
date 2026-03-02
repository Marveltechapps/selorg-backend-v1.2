/**
 * Auth controller – production-ready OTP authentication.
 * POST /auth/send-otp, POST /auth/resend-otp, POST /auth/verify-otp. Clean JSON only.
 */
const authService = require('../services/auth.service');

/**
 * POST /send-otp
 * Input: { phoneNumber } or { phone } (phoneNumber preferred)
 * Success: { success: true, message: "...", otp? } (otp only in DEV MODE)
 * Failure: { success: false, message: "<clear reason>" } with optional errorCode.
 */
const sendOtp = async (req, res, next) => {
  try {
    const raw = req.body?.phoneNumber ?? req.body?.phone;
    const phone = raw !== undefined && raw !== null ? String(raw).trim() : undefined;
    if (!phone || phone === '') {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }
    const result = await authService.sendOtp(phone);
    if (!result.success) {
      const status = result.errorCode === 'INVALID_PHONE' ? 400 : 400;
      return res.status(status).json({
        success: false,
        message: result.message,
        ...(result.errorCode && { errorCode: result.errorCode }),
      });
    }
    return res.status(200).json({
      success: true,
      message: result.message || 'OTP sent successfully',
      ...(result.otp != null && { otp: result.otp, debugOtp: result.otp }),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /resend-otp
 * Input: { phoneNumber } or { phone }. Always generates new OTP; returns it in DEV MODE.
 */
const resendOtp = async (req, res, next) => {
  try {
    const raw = req.body?.phoneNumber ?? req.body?.phone;
    const phone = raw !== undefined && raw !== null ? String(raw).trim() : undefined;
    if (!phone || phone === '') {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }
    const result = await authService.resendOtp(phone);
    if (!result.success) {
      const status = result.errorCode === 'INVALID_PHONE' ? 400 : 400;
      return res.status(status).json({
        success: false,
        message: result.message,
        ...(result.errorCode && { errorCode: result.errorCode }),
      });
    }
    return res.status(200).json({
      success: true,
      message: result.message || 'OTP sent successfully',
      ...(result.otp != null && { otp: result.otp, debugOtp: result.otp }),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /verify-otp
 * Input: { phoneNumber, otp } or { phone, otp }
 * Success: { success: true, message: "OTP verified", token?, user? }
 * Failure: { success: false, message: "<clear reason>" }
 */
const verifyOtp = async (req, res, next) => {
  try {
    const rawPhone = req.body?.phoneNumber ?? req.body?.phone;
    const rawOtp = req.body?.otp;
    const phone = rawPhone !== undefined && rawPhone !== null ? String(rawPhone).trim() : undefined;
    const otp = rawOtp !== undefined && rawOtp !== null ? String(rawOtp).trim() : undefined;
    if (phone === undefined || phone === '' || otp === undefined || otp === '') {
      return res.status(400).json({
        success: false,
        message: 'Phone and OTP are required',
      });
    }
    const result = await authService.verifyOtp(phone, otp);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        ...(result.errorCode && { errorCode: result.errorCode }),
      });
    }
    return res.status(200).json({
      success: true,
      message: result.message || 'OTP verified',
      ...(result.token && { token: result.token }),
      ...(result.user && { user: result.user }),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendOtp, resendOtp, verifyOtp };
