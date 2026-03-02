/**
 * SMS failure diagnostics – map gateway response to error codes and user-friendly messages.
 * Used when user says "OTP doesn't work" so we can log exact reason and return clear message.
 * India: DLT template, balance, carrier block, invalid number, gateway downtime, etc.
 */
const { OTP_ERROR_CODES } = require('../config/otp.constants');

/**
 * Classify gateway response/error into errorCode and userMessage.
 * Why OTP may not be delivered:
 * - Invalid number: gateway rejects format or DND
 * - DLT template not approved: India DLT compliance – template/PE not registered
 * - Insufficient balance: SMS vendor account low/zero balance
 * - Daily limit exceeded: vendor or operator cap
 * - SMS blocked by carrier: NDNC, operator filter
 * - API auth failure: wrong key/sender/template ID
 * - Timeout: gateway or network slow
 * - Gateway error: generic provider/network issue
 */
function classifySmsError(provider, statusCode, body, errMessage) {
  const raw = (body || '').trim();
  const lower = raw.toLowerCase();
  const code = statusCode || 0;

  // Timeout (from catch)
  if (errMessage && /timeout/i.test(errMessage)) {
    return {
      errorCode: OTP_ERROR_CODES.SMS_TIMEOUT,
      userMessage: 'SMS service is taking too long. Please try again in a moment.',
      internalLog: `[SMS] ${provider} timeout: ${errMessage}`,
    };
  }

  // Gateway contract mismatch: script did not receive mobile param (e.g. "Atleast one number is required to send message")
  if (/number\s*is\s*required|atleast\s*one\s*number|at\s+least\s+one\s+number|required\s+to\s+send\s+message/i.test(lower)) {
    return {
      errorCode: OTP_ERROR_CODES.SMS_GATEWAY_CONTRACT_ERROR,
      userMessage: 'SMS gateway expects different parameters. Check config param names (smsParamMobile, smsParamMessage).',
      internalLog: `[SMS] ${provider} contract error: gateway did not receive number param status=${code} body=${raw.slice(0, 200)}`,
    };
  }

  // Auth failure (401, invalid key, unauthorized)
  if (code === 401 || /unauthorized|invalid\s*(auth)?\s*key|authentication\s*failed|auth\s*failed/i.test(lower) || /invalid.*key|invalid.*auth/i.test(lower)) {
    return {
      errorCode: OTP_ERROR_CODES.SMS_AUTH_FAILURE,
      userMessage: 'SMS service configuration error. Please contact support.',
      internalLog: `[SMS] ${provider} auth failure status=${code} body=${raw.slice(0, 200)}`,
    };
  }

  // Invalid number only when body clearly indicates failure (not success messages that mention "number")
  const invalidNumberFailure =
    /invalid\s*(mobile|number|phone)/i.test(lower) ||
    /(valid\s*(mobile|number|phone)\s*(is\s*)?required|enter\s*a?\s*valid\s*(mobile|number|phone))/i.test(lower) ||
    (code >= 400 && code < 500 && /\b(mobile|number|phone)\b/i.test(lower));
  if (invalidNumberFailure) {
    return {
      errorCode: OTP_ERROR_CODES.SMS_INVALID_NUMBER,
      userMessage: 'SMS could not be sent to this number. Please check the number and try again.',
      internalLog: `[SMS] ${provider} invalid number status=${code} body=${raw.slice(0, 200)}`,
    };
  }

  // DLT template not approved (India)
  if (/dlt|template\s*not\s*approved|entity\s*id|template\s*id|pe\s*id|principal\s*entity|template\s*not\s*registered|flow\s*not\s*approved/i.test(lower)) {
    return {
      errorCode: OTP_ERROR_CODES.SMS_DLT_NOT_APPROVED,
      userMessage: 'OTP service is not fully set up for this sender. Please contact support.',
      internalLog: `[SMS] ${provider} DLT/template issue status=${code} body=${raw.slice(0, 200)}`,
    };
  }

  // Insufficient balance
  if (/insufficient|low\s*balance|balance\s*is\s*zero|no\s*credit|out\s*of\s*balance|recharge|top\s*up/i.test(lower)) {
    return {
      errorCode: OTP_ERROR_CODES.SMS_INSUFFICIENT_BALANCE,
      userMessage: 'SMS service temporarily unavailable. Please try again later.',
      internalLog: `[SMS] ${provider} insufficient balance status=${code} body=${raw.slice(0, 200)}`,
    };
  }

  // Daily / quota limit
  if (/daily\s*limit|limit\s*exceeded|quota\s*exceeded|max\s*sms|per\s*day\s*limit/i.test(lower)) {
    return {
      errorCode: OTP_ERROR_CODES.SMS_DAILY_LIMIT,
      userMessage: 'SMS limit reached. Please try again tomorrow.',
      internalLog: `[SMS] ${provider} daily limit status=${code} body=${raw.slice(0, 200)}`,
    };
  }

  // Carrier / operator block (NDNC, blocked, rejected)
  if (/ndnc|blocked|carrier|rejected\s*by\s*operator|operator\s*reject|dnd|do\s*not\s*disturb/i.test(lower)) {
    return {
      errorCode: OTP_ERROR_CODES.SMS_CARRIER_BLOCK,
      userMessage: 'SMS could not be delivered to this number. Try another number or contact support.',
      internalLog: `[SMS] ${provider} carrier/block status=${code} body=${raw.slice(0, 200)}`,
    };
  }

  // Generic gateway error
  return {
    errorCode: OTP_ERROR_CODES.SMS_GATEWAY_ERROR,
    userMessage: 'Unable to send OTP. Please try again in a few minutes.',
    internalLog: `[SMS] ${provider} gateway error status=${code} err=${errMessage || ''} body=${raw.slice(0, 200)}`,
  };
}

module.exports = { classifySmsError };
