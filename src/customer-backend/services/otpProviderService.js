const { loadOtpConfig } = require('../../picker/config/otp.config');

/** 4-digit OTP from auth message (matches smsMessageTemplate in src/config.json). */
function extractOtpFromText(text) {
  const m = String(text || '').match(/\b(\d{4})\b/);
  return m ? m[1] : null;
}

/**
 * Customer OTP SMS – driven by selorg-dashboard-backend-v1.1/src/config.json (via picker otp.config):
 * smsvendor, smsParam*, smsMethod, smsMessageTemplate, smsUseCountryCode / smsPrependCountryCode,
 * optional msg91*, fast2sms*, twilio*, smsProvider. Same path as OTP_CONFIG_PATH when set.
 */
async function sendSms({ to, text }) {
  const digits = String(to || '').replace(/\D/g, '').slice(-10);
  const cfg = loadOtpConfig();

  const bypassNumbers = String(cfg.otpBypassNumbers || process.env.OTP_BYPASS_NUMBERS || '')
    .split(',')
    .map((n) => n.replace(/\D/g, '').slice(-10))
    .filter(Boolean);
  if (bypassNumbers.includes(digits)) {
    return { success: true, body: 'configured-test-mobile-bypass' };
  }

  if (digits.length !== 10) {
    return { success: false, error: 'Invalid mobile number' };
  }

  const otp = extractOtpFromText(text);
  if (!otp) {
    return { success: false, error: 'Could not extract OTP from message' };
  }

  const { sendOtpSms, getLastSmsResult } = require('../../picker/services/sms.service');
  const result = await sendOtpSms(digits, otp, 5);

  if (result.sent) {
    return { success: true, body: result.internalLog || 'sms-sent' };
  }

  const last = getLastSmsResult();
  const errMsg =
    result.userMessage ||
    last?.userMessage ||
    result.internalLog ||
    last?.internalLog ||
    'Failed to send OTP via SMS';

  return { success: false, error: errMsg };
}

module.exports = { sendSms };
