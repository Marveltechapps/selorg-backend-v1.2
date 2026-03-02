/**
 * Shared SMS Gateway for OTP delivery.
 * Reads credentials from src/config.json per OTP_PROCESS_WORKFLOW.md.
 *
 * Config keys: smsvendor, smsParamMobile, smsParamMessage, smsMethod, otpDevMode,
 *   smsUseCountryCode (false = 10-digit for Spearuc India), smsMessageTemplate (DLT must match exactly)
 */
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');
const SMS_TIMEOUT_MS = 15000;
const DEFAULT_SMS_MESSAGE = 'Dear Applicant, Your OTP for Mobile No. Verification is {otp} . MJPTBCWREIS - EVOLGN';

let _config = null;

function loadConfig() {
  if (_config !== null) return _config;
  try {
    const fs = require('fs');
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    _config = JSON.parse(raw);
    const hasVendor = !!((_config.smsvendor || '').trim());
    const devMode = _config.otpDevMode === 1 || _config.otpDevMode === true || process.env.OTP_DEV_MODE === '1' || process.env.OTP_DEV_MODE === 'true';
    try {
      const { logger } = require('../hhd/utils/logger');
      logger.info(`[SMS] Config loaded: smsvendor=${hasVendor ? 'set' : 'NOT SET'}, otpDevMode=${devMode}`);
    } catch (_) {
      console.log(`[SMS] Config loaded: smsvendor=${hasVendor ? 'set' : 'NOT SET'}, otpDevMode=${devMode}`);
    }
    return _config;
  } catch (e) {
    _config = {};
    try {
      const { logger } = require('../hhd/utils/logger');
      logger.warn('[SMS] Config not loaded (using defaults): ' + (e && e.message));
    } catch (_) {
      console.warn('[SMS] Config not loaded:', e && e.message);
    }
    return _config;
  }
}

/** Generate 4-digit OTP (1000–9999) per workflow */
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Build SMS URL for GET. Reads from config.json:
 * - smsvendor (required): base URL with credentials, must end with &
 * - smsParamMobile: default to_mobileno (Spearuc)
 * - smsParamMessage: default sms_text (Spearuc)
 * - smsUseCountryCode: true = 91+10 digits, false/omit = 10 digits (Spearuc India)
 * - smsMessageTemplate: DLT template, use {otp} or {#var#} for OTP placeholder
 */
function buildSmsRequest(mobileNumber, otp) {
  const config = loadConfig();
  const base = (config.smsvendor || process.env.SMS_VENDOR_URL || '').trim();
  if (!base) return null;

  const mobile = String(mobileNumber).replace(/\D/g, '').slice(-10);
  if (mobile.length !== 10) return null;

  const paramMobile = config.smsParamMobile || 'to_mobileno';
  const paramMessage = config.smsParamMessage || 'sms_text';
  const template = config.smsMessageTemplate || DEFAULT_SMS_MESSAGE;
  const message = template.replace(/{otp}/g, otp).replace(/\{#var#\}/g, otp);

  // Spearuc India: use 10-digit unless config explicitly sets smsUseCountryCode: true
  const useCountryCode = config.smsUseCountryCode === true;
  const mobileParam = useCountryCode ? '91' + mobile : mobile;

  const sep = base.includes('?') && !base.endsWith('&') && !base.endsWith('?') ? '&' : '';
  const url = `${base}${sep}${paramMobile}=${encodeURIComponent(mobileParam)}&${paramMessage}=${encodeURIComponent(message)}`;

  return { url, mobile, mobileParam, message, paramMobile, paramMessage };
}

/**
 * Parse gateway response. Success when: 2xx and body indicates success.
 * Spear UC and similar gateways may return: "success", "1", "Sent", JSON with status/result/response.
 */
function isSuccess(statusCode, body) {
  if (statusCode < 200 || statusCode >= 300) return false;
  const raw = (body || '').trim();
  const lower = raw.toLowerCase();
  // Plain text success (e.g. "success", "1", "Sent")
  if (/^(success|sent|ok|1|submitted|accepted|delivered)$/.test(lower)) return true;
  try {
    const j = JSON.parse(raw);
    const s = (j?.status ?? j?.result ?? j?.Result ?? j?.response ?? j?.Response ?? j?.Status ?? j?.data?.status ?? j?.message ?? '').toString().toLowerCase();
    if (s === 'fail' || s === 'error' || s === 'failure') return false;
    if (s === 'success' || s === 'sent' || s === 'ok' || s === '1' || s === 'submitted' || s === 'accepted') return true;
  } catch (_) {}
  if (/\b(success|sent|ok|delivered|submitted|accepted)\b/.test(lower) && !/\b(fail|error|invalid|denied)\b/.test(lower)) return true;
  return false;
}

/** Test mobiles – no SMS sent, fixed OTP returned (for testing). 7418268091 uses real SMS (realtime). */
const TEST_MOBILES = new Set(['9698790921']);

/** When set in config, any number gets this OTP, no SMS (for testing) */
function getTestOtpForAny() {
  const config = loadConfig();
  const val = config.testOtpForAny;
  return val && /^\d{4}$/.test(String(val).trim()) ? String(val).trim() : null;
}

/**
 * Send OTP via SMS gateway.
 * @param {string} mobileNumber - 10-digit mobile
 * @param {string} otp - 4-digit OTP
 * @returns {Promise<{success: boolean}>}
 */
function sendOtpSms(mobileNumber, otp) {
  const digits = String(mobileNumber).replace(/\D/g, '').slice(-10);
  if (TEST_MOBILES.has(digits)) {
    return Promise.resolve({ success: true });
  }
  if (getTestOtpForAny()) {
    try {
      const { logger } = require('../hhd/utils/logger');
      logger.info(`[SMS] Skipping send (testOtpForAny): ${digits}`);
    } catch (_) {
      console.log(`[SMS] Skipping send (testOtpForAny): ${digits}`);
    }
    return Promise.resolve({ success: true });
  }
  const req = buildSmsRequest(mobileNumber, otp);
  if (!req) {
    try {
      const { logger } = require('../hhd/utils/logger');
      logger.warn('[SMS] Not sent: smsvendor not configured or invalid (buildSmsRequest returned null)');
    } catch (_) {
      console.warn('[SMS] Not sent: smsvendor not configured or invalid');
    }
    return Promise.resolve({ success: false });
  }

  return new Promise((resolve) => {
    const parsed = require('url').parse(req.url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = { timeout: SMS_TIMEOUT_MS, headers: { 'User-Agent': 'Selorg-OTP/1.0', Accept: '*/*' } };

    // Log SMS attempt (redact full URL in prod)
    const { logger } = require('../hhd/utils/logger');
    logger.info(`[SMS] Sending to ${req.mobile} (param: ${req.mobileParam}), URL: ${parsed.protocol}//${parsed.host}${parsed.pathname}?***`);
    logger.info(`[SMS] Full request URL (debugging): ${req.url}`);

    const clientReq = lib.get(req.url, opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const ok = isSuccess(res.statusCode, data);
        logger.info(`[SMS] Gateway response: status=${res.statusCode}, body=${(data || '').slice(0, 500)}`);
        try {
          const j = JSON.parse(data || '{}');
          const campaignId = j?.campaign_id || j?.CampaignId;
          if (ok && campaignId) {
            logger.info(`[SMS] Gateway accepted: campaign_id=${campaignId} to ${req.mobile}`);
          }
        } catch (_) {}
        if (!ok) {
          logger.warn(`[SMS] Gateway returned status=${res.statusCode}, body=${(data || '').slice(0, 300)}`);
        } else {
          logger.info(`[SMS] Gateway success for ${req.mobile}, status=${res.statusCode}`);
        }
        resolve({ success: !!ok, statusCode: res.statusCode, body: data });
      });
    });
    clientReq.on('error', (err) => {
      logger.warn(`[SMS] Request error: ${err?.message}`);
      resolve({ success: false, error: err?.message });
    });
    clientReq.setTimeout(SMS_TIMEOUT_MS, () => {
      clientReq.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });
  });
}

/** Check if OTP dev mode is on (no real SMS) */
function isOtpDevMode() {
  const config = loadConfig();
  return config.otpDevMode === 1 || config.otpDevMode === true || process.env.OTP_DEV_MODE === '1' || process.env.OTP_DEV_MODE === 'true';
}

/** Optional test mobile – return fixed OTP instead of sending SMS */
const TEST_OTP = '8790';

function getTestOtpIfApplicable(mobileNumber) {
  const digits = String(mobileNumber).replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return null;
  const forAny = getTestOtpForAny();
  if (forAny) return forAny;
  return TEST_MOBILES.has(digits) ? TEST_OTP : null;
}

module.exports = {
  generateOTP,
  sendOtpSms,
  isOtpDevMode,
  getTestOtpIfApplicable,
  SIGNIN_SMS_MESSAGE: DEFAULT_SMS_MESSAGE,
};
