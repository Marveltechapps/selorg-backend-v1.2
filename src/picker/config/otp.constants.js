/**
 * OTP authentication constants – production-ready limits and codes.
 * Used by auth service and SMS service for Indian +91 10-digit flow.
 */

// OTP format: 4-digit numeric only
const OTP_LENGTH = 4;
const OTP_MIN = 1000;
const OTP_MAX = 9999;

// Expiry: 5 minutes (user requirement)
const OTP_TTL_MINUTES = 5;
const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;

// Resend limits (anti-spam): min 60s between sends, max 5 per 15 min per phone
const RESEND_COOLDOWN_SEC = 60;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN_SEC * 1000;
const RESEND_WINDOW_MINUTES = 15;
const RESEND_MAX_PER_WINDOW = 5;

// Verify: max wrong OTP attempts per phone before temporary block
const VERIFY_MAX_WRONG_ATTEMPTS = 5;
const VERIFY_WRONG_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000; // 15 min

// DEV mode: fixed OTP when NODE_ENV=development or OTP_DEV_MODE=1 (no real SMS)
const DEV_FIXED_OTP = '1234';

// Diagnostic error codes (for logging and optional client handling)
const OTP_ERROR_CODES = {
  INVALID_PHONE: 'INVALID_PHONE',
  RATE_LIMIT: 'RATE_LIMIT',
  OTP_NOT_FOUND: 'OTP_NOT_FOUND',
  OTP_EXPIRED: 'OTP_EXPIRED',
  INCORRECT_OTP: 'INCORRECT_OTP',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  SMS_INVALID_NUMBER: 'SMS_INVALID_NUMBER',
  SMS_DLT_NOT_APPROVED: 'SMS_DLT_NOT_APPROVED',
  SMS_INSUFFICIENT_BALANCE: 'SMS_INSUFFICIENT_BALANCE',
  SMS_DAILY_LIMIT: 'SMS_DAILY_LIMIT',
  SMS_CARRIER_BLOCK: 'SMS_CARRIER_BLOCK',
  SMS_AUTH_FAILURE: 'SMS_AUTH_FAILURE',
  SMS_TIMEOUT: 'SMS_TIMEOUT',
  SMS_GATEWAY_ERROR: 'SMS_GATEWAY_ERROR',
  SMS_GATEWAY_CONTRACT_ERROR: 'SMS_GATEWAY_CONTRACT_ERROR',
};

module.exports = {
  OTP_LENGTH,
  OTP_MIN,
  OTP_MAX,
  OTP_TTL_MINUTES,
  OTP_TTL_MS,
  RESEND_COOLDOWN_SEC,
  RESEND_COOLDOWN_MS,
  RESEND_WINDOW_MINUTES,
  RESEND_MAX_PER_WINDOW,
  VERIFY_MAX_WRONG_ATTEMPTS,
  VERIFY_WRONG_ATTEMPTS_WINDOW_MS,
  DEV_FIXED_OTP,
  OTP_ERROR_CODES,
};
