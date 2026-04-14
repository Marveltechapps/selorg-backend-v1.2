/**
 * POST /manager/request-otp, POST /manager/verify-otp
 */
const managerOtpService = require('../services/managerOtp.service');

async function requestOtp(req, res) {
  try {
    const result = await managerOtpService.requestManagerOtp(req.userId);
    return res.status(200).json(result);
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      error: err.message || 'Request failed',
    });
  }
}

async function verifyOtp(req, res) {
  try {
    const { otp } = req.body || {};
    const result = await managerOtpService.verifyManagerOtp(req.userId, otp);
    return res.status(200).json(result);
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({
      success: false,
      error: err.message || 'Verification failed',
    });
  }
}

module.exports = { requestOtp, verifyOtp };
