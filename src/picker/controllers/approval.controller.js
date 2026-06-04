'use strict';

/**
 * POST /approval/verify-location-otp — picker enters permanent location OTP from admin dashboard.
 */
const pickerApprovalService = require('../services/pickerApproval.service');

async function verifyLocationOtp(req, res) {
  try {
    const { otp, locationId } = req.body || {};
    const result = await pickerApprovalService.verifyApprovalLocationOtp(req.userId, {
      otp,
      locationId,
    });
    return res.status(200).json(result);
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      error: err.message || 'Verification failed',
      code: err.code || 'VERIFICATION_FAILED',
    });
  }
}

module.exports = { verifyLocationOtp };
