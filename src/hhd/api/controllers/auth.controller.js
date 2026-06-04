const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDUser = require('../../models/User.model');
const { createOTP, verifyOTP } = require('../../services/otp.service');
const { logger } = require('../../utils/logger');
const db = require('../../../config/db');
const { sendOtpSms, isOtpDevMode, getTestOtpIfApplicable, generateOTP } = require('../../../utils/smsGateway');
const { recordHhdPickerPresence } = require('../../../picker/helpers/hhdLink.helper');
const { findPickerByPhone } = require('../../../picker/helpers/hhdLink.helper');
const {
  resolveAndLinkPickerForHhdUser,
  syncHhdUserFromPicker,
  buildHhdPickerProfilePayload,
  buildHhdUserProfileResponse,
} = require('../../services/hhdPickerProfile.service');

async function sendOTP(req, res, next) {
  const { mobile, mobileNumber } = req.body;
  const mobileParam = mobile || mobileNumber; // Workflow doc uses mobileNumber
  logger.info(`[Send OTP] Request received for mobile: ${mobileParam || 'N/A'}`);

  try {
    if (!mobileParam) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a mobile number',
        error: 'Mobile number is required',
      });
    }
    const normalizedMobile = String(mobileParam).replace(/\D/g, '').slice(-10);
    if (normalizedMobile.length !== 10 || /^0+$/.test(normalizedMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number',
        error: 'Invalid mobile number format',
      });
    }

    if (!db.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again in a moment.',
        error: 'Database connection not available',
      });
    }

    const testOtp = getTestOtpIfApplicable(normalizedMobile);
    const otp = testOtp || generateOTP();
    const { picker: registeredPicker } = await findPickerByPhone(normalizedMobile);

    if (isOtpDevMode()) {
      try {
        await createOTP(normalizedMobile, otp); // pass otp so we use test/fixed OTP in dev
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to store OTP', error: e.message });
      }
      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          mobile: normalizedMobile,
          otp,
          pickerRegistered: !!registeredPicker,
        },
      });
    }

    const smsResult = await sendOtpSms(normalizedMobile, otp);
    if (!smsResult.success) {
      logger.warn(`[Send OTP] SMS failed for ${normalizedMobile}: ${smsResult.body || smsResult.error}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP via SMS. Please try again.',
        error: 'SMS delivery failed',
      });
    }

    try {
      await createOTP(normalizedMobile, otp); // use OTP we already sent via SMS
    } catch (otpError) {
      return res.status(500).json({ success: false, message: 'OTP could not be stored', error: 'Service error' });
    }
    // Include OTP in response when using test number (no real SMS sent) - for app auto-fill
    const includeOtp = !!testOtp;
    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        mobile: normalizedMobile,
        pickerRegistered: !!registeredPicker,
        ...(includeOtp && { otp }),
      },
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'An error occurred while sending OTP. Please try again.',
        error: error.message || 'Internal server error',
      });
    }
  }
}

async function verifyOTPHandler(req, res, next) {
  const startTime = Date.now();
  const { mobile, mobileNumber, otp, enteredOTP } = req.body;
  const mobileParam = mobile || mobileNumber;
  const otpParam = otp || enteredOTP;
  logger.info(`[Verify OTP] Request received for mobile: ${mobileParam || 'N/A'}`);

  try {
    if (!mobileParam) {
      return res.status(400).json({ success: false, message: 'Please provide mobile number', error: 'Mobile number is required' });
    }
    if (!otpParam) {
      return res.status(400).json({ success: false, message: 'Please provide OTP', error: 'OTP is required' });
    }
    const normalizedMobile = String(mobileParam).replace(/\D/g, '').slice(-10);
    const normalizedOtp = String(otpParam).trim();
    if (normalizedMobile.length !== 10 || /^0+$/.test(normalizedMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number',
        error: 'Invalid mobile number format',
      });
    }
    if (!/^\d{4}$/.test(normalizedOtp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP format. Please enter a 4-digit code.',
        error: 'Invalid OTP format',
      });
    }

    if (!db.isConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again in a moment.',
        error: 'Database connection not available',
      });
    }

    let isValid;
    try {
      isValid = await Promise.race([
        verifyOTP(normalizedMobile, normalizedOtp),
        new Promise((_, rej) => setTimeout(() => rej(new Error('OTP verification timeout')), 10000)),
      ]);
    } catch (verifyError) {
      let errorMessage = 'Failed to verify OTP. Please try again.';
      if (verifyError.message.includes('Database not available') || verifyError.message.includes('timeout')) {
        errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
      }
      return res.status(500).json({ success: false, message: errorMessage, error: 'OTP verification failed' });
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. Please try again.',
        error: 'Invalid OTP',
      });
    }

    let user = await HHDUser.findOne({ mobile: normalizedMobile });
    if (!user) {
      user = await HHDUser.create({ mobile: normalizedMobile, isActive: true });
    }
    user.lastLogin = new Date();
    await user.save().catch(() => {});
    const { picker: linkedPicker } = await resolveAndLinkPickerForHhdUser(user);
    if (linkedPicker) {
      await syncHhdUserFromPicker(user, linkedPicker);
      try {
        await recordHhdPickerPresence(linkedPicker, { hhdUser: user });
      } catch (presenceErr) {
        logger.warn(
          `[Verify OTP] Failed to sync picker presence for ${normalizedMobile}: ${presenceErr.message}`
        );
      }
    }

    const pickerProfile = await buildHhdPickerProfilePayload(user, linkedPicker);
    const token = user.getSignedJwtToken();
    const picker = pickerProfile.picker;
    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        token,
        user: {
          id: user._id.toString(),
          mobile: user.mobile,
          name: user.name || picker?.name || null,
          role: user.role || picker?.role || 'picker',
          email: picker?.email || null,
          warehouse: picker?.locationName || null,
          department: picker?.department || null,
          pickerId: picker?.id || null,
          employeeId: picker?.employeeId || null,
          photoUri: picker?.photoUri || null,
        },
        pickerProfile,
      },
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'An error occurred while verifying OTP. Please try again.',
        error: error.message || 'Internal server error',
      });
    }
  }
}

async function getMe(req, res, next) {
  try {
    const profile = await buildHhdUserProfileResponse(req.user?.id, { touchPresence: true });
    if (!profile) throw new ErrorResponse('User not found', 404);
    res.status(200).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

async function resendOTP(req, res) {
  return sendOTP(req, res);
}

module.exports = { sendOTP, resendOTP, verifyOTP: verifyOTPHandler, getMe, logout };
