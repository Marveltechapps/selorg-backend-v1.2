/**
 * SMS service – real-time OTP delivery to phone.
 * Uses config (smsvendor), MSG91, Fast2SMS, Twilio. Credentials from config/env only (no hardcoding).
 * India: DLT template-based OTP – use approved template ID in MSG91/config.
 * Returns structured result for failure diagnostics (why OTP may not be delivered).
 */
const http = require('http');
const https = require('https');
const { getSmsVendorUrl, getSmsVendorParams, getSmsMessageTemplate, getSmsProvider, getTwilioConfig, getMsg91Config } = require('../config/otp.config');
const { classifySmsError } = require('./sms-diagnostics');

const SMS_TIMEOUT_MS = 15000;

/** Last SMS provider error (status + body) for debugging when debugMode is on. */
let lastSmsError = null;
/** Last structured result: { sent, errorCode?, userMessage?, internalLog? } for auth to return clear reason. */
let lastSmsResult = null;

const MAX_DEBUG_BODY_LENGTH = 2000;

function setLastSmsError(provider, statusCode, body, errMessage) {
  lastSmsError = {
    provider,
    statusCode: statusCode ?? null,
    body: (body || '').slice(0, MAX_DEBUG_BODY_LENGTH),
    errMessage: errMessage || null,
  };
  const classified = classifySmsError(provider, statusCode, body, errMessage);
  lastSmsResult = { sent: false, ...classified };
}

function getLastSmsError() {
  return lastSmsError;
}

function getLastSmsResult() {
  return lastSmsResult;
}

const logOtp = (phone, otp) => {
  console.log(`[SMS] OTP for ${phone}: ${otp} (no provider configured – add config.json smsvendor or .env FAST2SMS/TWILIO)`);
};

/** Use phone as-is: digits only. For India 10-digit, optionally prepend country code via config. */
function normalizeMobileForVendor(phone) {
  return String(phone).replace(/\D/g, '');
}

/** E.164 for Twilio: +91 + 10-digit India. */
function toE164India(phone) {
  const digits = normalizeMobileForVendor(phone);
  if (digits.length === 10 && /^[5-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits.length === 10 ? `+91${digits}` : null;
}

const MAX_REDIRECTS = 5;

/** Parse vendor response – 2xx; treat as success only when status is explicitly success (workflow: response.data.status === "success"). */
function isConfigVendorSuccess(statusCode, body) {
  if (statusCode < 200 || statusCode >= 300) return false;
  const raw = (body || '').trim();
  const lower = raw.toLowerCase();
  // JSON: require explicit success (DLT gateways often return status/result)
  try {
    const j = JSON.parse(raw);
    const s = (j?.status ?? j?.result ?? j?.Status ?? j?.Result ?? j?.data?.status ?? '').toString().toLowerCase();
    const code = j?.status_code ?? j?.statusCode ?? j?.data?.status_code;
    if (s === 'fail' || s === 'error' || s === 'failure' || code === 0 || code === '0') return false;
    if (s === 'success' || s === 'sent' || s === 'ok') return true;
    // If response is JSON but has no success-like status, do not assume success (avoids "200 OK but no SMS")
    if (typeof j === 'object' && (j.status !== undefined || j.result !== undefined || j.Status !== undefined)) return false;
  } catch (_) {}
  if (raw === '') return true;
  if (/\b(success|sent|ok|delivered|message\s+sent)\b/.test(lower)) return true;
  if (/^\s*{\s*"?(status|result)"?\s*:\s*"(fail|error)"\s*}/.test(lower)) return false;
  if (/^(error|invalid|failed|denied):\s*/im.test(raw)) return false;
  if (/\b(status|result)\s*[=:]\s*["']?(fail|error)["']?\b/.test(lower)) return false;
  if (raw.length < 80 && /\b(fail|error|invalid|denied|reject|insufficient|balance)\b/.test(lower)) return false;
  return true;
}

const SMS_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; PickerApp-SMS/1.0)', Accept: '*/*' };

/** GET request with redirect following. Resolves to { statusCode, body } or rejects. */
function httpGetWithRedirects(url, options, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(new Error('Invalid URL: ' + e?.message));
      return;
    }
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.get(
      url,
      { timeout: options.timeout || SMS_TIMEOUT_MS, headers: SMS_HEADERS },
      (res) => {
        const isRedirect = res.statusCode >= 301 && res.statusCode <= 308;
        const location = res.headers.location;
        if (isRedirect && location && redirectCount < MAX_REDIRECTS) {
          let nextUrl = location;
          if (nextUrl.startsWith('/')) {
            nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
          } else if (!/^https?:\/\//i.test(nextUrl)) {
            nextUrl = new URL(nextUrl, url).href;
          }
          res.resume();
          httpGetWithRedirects(nextUrl, options, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.setTimeout(options.timeout || SMS_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/** POST request (application/x-www-form-urlencoded) with redirect following. */
function httpPostWithRedirects(url, bodyStr, options, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(new Error('Invalid URL: ' + e?.message));
      return;
    }
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const timeout = options.timeout || SMS_TIMEOUT_MS;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...SMS_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
      },
      timeout,
    };
    const req = lib.request(reqOpts, (res) => {
      const isRedirect = res.statusCode >= 301 && res.statusCode <= 308;
      const location = res.headers.location;
      if (isRedirect && location && redirectCount < MAX_REDIRECTS) {
        let nextUrl = location;
        if (nextUrl.startsWith('/')) {
          nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
        } else if (!/^https?:\/\//i.test(nextUrl)) {
          nextUrl = new URL(nextUrl, url).href;
        }
        res.resume();
        httpPostWithRedirects(nextUrl, bodyStr, options, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(bodyStr, 'utf8');
    req.end();
  });
}

/** Build URL-encoded body for POST (mobileno=...&msg=...). */
function buildPostBody(paramMobile, paramMessage, mobile, msg) {
  const enc = (s) => encodeURIComponent(s).replace(/%20/g, '+');
  return `${paramMobile}=${enc(mobile)}&${paramMessage}=${enc(msg)}`;
}

/** Send via config file smsvendor (Spear UC–style). Param names and optional DLT message template from config. */
const sendViaConfigSms = (phone, otp) => {
  const { OTP_ERROR_CODES } = require('../config/otp.constants');
  let baseUrl = getSmsVendorUrl();
  if (!baseUrl) return Promise.resolve({ sent: false });
  const baseClean = baseUrl.replace(/\&+$/, '');
  const { paramMobile, paramMessage, countryCode, prependCountryCode, method } = getSmsVendorParams();
  const template = getSmsMessageTemplate();
  const msg = template ? String(template).replace(/\{otp\}/gi, otp) : `Your Picker App OTP is ${otp}. Valid for 5 min.`;
  const digits = normalizeMobileForVendor(phone);
  const mobile = (prependCountryCode && countryCode ? countryCode : '') + digits;
  const sep = baseClean.includes('?') ? '&' : '?';
  const usePost = method === 'POST';

  if (prependCountryCode && countryCode) {
    console.log('[SMS] Number format: with country code', countryCode, '→', mobile);
  } else {
    console.log('[SMS] Number format: digits only →', digits);
  }

  const buildUrlWithParams = (mobileVal) =>
    `${baseClean}${sep}${paramMobile}=${encodeURIComponent(mobileVal)}&${paramMessage}=${encodeURIComponent(msg)}`;

  const tryRequest = (mobileVal) => {
    const opts = { timeout: SMS_TIMEOUT_MS };
    if (usePost) {
      const bodyStr = buildPostBody(paramMobile, paramMessage, mobileVal, msg);
      const urlWithParams = buildUrlWithParams(mobileVal);
      return httpPostWithRedirects(urlWithParams, bodyStr, opts);
    }
    return httpGetWithRedirects(buildUrlWithParams(mobileVal), opts);
  };

  const bodySaysNumberRequired = (b) =>
    (b || '').toLowerCase().includes('number is required') || (b || '').toLowerCase().includes('atleast one number') || (b || '').toLowerCase().includes('at least one number');

  const doOneAttempt = (mobileVal) => {
    const urlForLog = usePost ? baseClean : buildUrlWithParams(mobileVal);
    const redactedUrl = urlForLog.replace(/pass=[^&]+/i, 'pass=***').replace(/user=[^&]+/i, 'user=***');
    console.log('[SMS] Config vendor request:', usePost ? 'POST' : 'GET', '| paramMobile=', paramMobile, '| paramMessage=', paramMessage, '| full URL (redacted):', redactedUrl);

    return tryRequest(mobileVal).then((r) => {
      const bodyPreview = (r.body || '(empty)').trim().slice(0, 400);
      console.log('[SMS] Gateway response: HTTP', r.statusCode, '| body:', bodyPreview);

      if (isConfigVendorSuccess(r.statusCode, r.body)) {
        lastSmsError = null;
        lastSmsResult = { sent: true };
        console.log('[SMS] Config vendor OK to', mobileVal);
        return { sent: true };
      }

      setLastSmsError('config_smsvendor', r.statusCode, r.body, null);
      console.warn('[SMS] Config vendor FAIL – statusCode:', r.statusCode, '| param used:', paramMobile, '| body:', bodyPreview);
      return { sent: false, numberRequired: bodySaysNumberRequired(r.body), ...getLastSmsResult() };
    });
  };

  const attempt = (mobileVal, digitsOnlyRetryDone) => {
    return doOneAttempt(mobileVal).then((out) => {
      if (out.sent) return out;
      if (out.numberRequired && !digitsOnlyRetryDone && mobileVal !== digits && prependCountryCode && countryCode && String(mobileVal).startsWith(countryCode)) {
        console.warn('[SMS] Gateway returned "number required" – single retry with digits only (no country code)');
        return attempt(digits, true);
      }
      if (out.numberRequired) {
        console.warn('[SMS] Gateway contract error: "number required". No further retries. Check config smsParamMobile / smsParamMessage.');
        lastSmsResult = {
          sent: false,
          errorCode: OTP_ERROR_CODES.SMS_GATEWAY_CONTRACT_ERROR,
          userMessage: 'SMS gateway expects different parameters. Check config param names (smsParamMobile, smsParamMessage).',
          internalLog: '[SMS] Gateway contract error: number required',
        };
      }
      return { sent: false, ...getLastSmsResult() };
    });
  };

  return attempt(mobile, false).catch((err) => {
    setLastSmsError('config_smsvendor', null, null, err?.message);
    const redactedUrl = baseClean.replace(/pass=[^&]+/i, 'pass=***').replace(/user=[^&]+/i, 'user=***');
    console.warn('[SMS] Config vendor error (network/timeout?):', err?.message);
    console.warn('[SMS] Request URL (redacted):', redactedUrl);
    return { sent: false, ...getLastSmsResult() };
  });
};

/**
 * MSG91 SendOTP (India) – DLT template-based. GET api.msg91.com/api/sendotp.php.
 * Params: authkey, mobile (91XXXXXXXXXX), otp, sender, message (optional), otp_expiry (minutes).
 * OTP may not be delivered if: DLT template not approved, insufficient balance, invalid number, auth failure.
 */
const sendViaMsg91 = (phone, otp, otpExpiryMinutes = 5) => {
  const { authKey, sender, templateId } = getMsg91Config();
  if (!authKey) return Promise.resolve({ sent: false });
  const digits = normalizeMobileForVendor(phone);
  if (digits.length !== 10 || !/^[5-9]/.test(digits)) return Promise.resolve({ sent: false });
  const mobile = `91${digits}`;
  const message = `Your verification code is ${otp}. Valid for ${otpExpiryMinutes} min.`;
  const params = new URLSearchParams({
    authkey: authKey,
    mobile: mobile,
    otp: String(otp),
    sender: sender || 'SMSIND',
    message,
    otp_expiry: String(otpExpiryMinutes),
    otp_length: '4',
  });
  if (templateId) params.set('otp_template_id', templateId);
  const url = `https://api.msg91.com/api/sendotp.php?${params.toString()}`;
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { timeout: SMS_TIMEOUT_MS, headers: { 'User-Agent': 'PickerApp-SMS/1.0', Accept: '*/*' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            const ok = (j?.type || j?.Type || '').toLowerCase() === 'success';
            if (ok) {
              lastSmsResult = { sent: true };
              lastSmsError = null;
              resolve({ sent: true });
            } else {
              setLastSmsError('MSG91', res.statusCode, data, j?.message || j?.Message || null);
              resolve({ sent: false, ...getLastSmsResult() });
            }
          } catch (_) {
            setLastSmsError('MSG91', res.statusCode, data, 'Parse error');
            resolve({ sent: false, ...getLastSmsResult() });
          }
        });
      }
    );
    req.on('error', (err) => {
      setLastSmsError('MSG91', null, null, err?.message);
      resolve({ sent: false, ...getLastSmsResult() });
    });
    req.setTimeout(SMS_TIMEOUT_MS, () => {
      req.destroy();
      setLastSmsError('MSG91', null, null, 'Request timeout');
      resolve({ sent: false, ...getLastSmsResult() });
    });
  });
};

/** Fast2SMS – India. route=otp (DLT) or q (Quick SMS). numbers: 10-digit or 91+10. */
const sendViaFast2SMS = (phone, otp) => {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) return Promise.resolve({ sent: false });
  const route = process.env.FAST2SMS_ROUTE || 'q';
  const numbers = phone.length === 10 ? phone : phone.replace(/\D/g, '').replace(/^0/, '91');
  const body =
    route === 'otp'
      ? JSON.stringify({ route: 'otp', numbers, variables_values: otp, flash: 0 })
      : JSON.stringify({
          route: 'q',
          message: `Your Picker App OTP is ${otp}. Valid for 5 min.`,
          numbers,
          flash: 0,
        });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'www.fast2sms.com',
        path: '/dev/bulkV2',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: apiKey,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            const ok = j?.return === true;
            if (ok) {
              lastSmsResult = { sent: true };
              lastSmsError = null;
              resolve({ sent: true });
            } else {
              setLastSmsError('Fast2SMS', res.statusCode, data, j?.message || null);
              console.warn('[SMS] Fast2SMS FAIL – statusCode:', res.statusCode, ', body:', data);
              resolve({ sent: false, ...getLastSmsResult() });
            }
          } catch {
            setLastSmsError('Fast2SMS', res.statusCode, data, 'Parse error');
            resolve({ sent: false, ...getLastSmsResult() });
          }
        });
      }
    );
    req.on('error', (err) => {
      setLastSmsError('Fast2SMS', null, null, err?.message);
      console.warn('[SMS] Fast2SMS error:', err?.message);
      resolve({ sent: false, ...getLastSmsResult() });
    });
    req.setTimeout(SMS_TIMEOUT_MS, () => {
      req.destroy();
      setLastSmsError('Fast2SMS', null, null, 'Request timeout');
      resolve({ sent: false, ...getLastSmsResult() });
    });
    req.write(body);
    req.end();
  });
};

/** Twilio – global, works in India. Phone: 10-digit → +91XXXXXXXXXX via toE164India. Creds from config + env. */
const sendViaTwilio = (phone, otp) => {
  const { accountSid: sid, authToken: token, phoneNumber: from } = getTwilioConfig();
  if (!sid || !token || !from) {
    return Promise.resolve({ sent: false });
  }
  const to = toE164India(phone) || (String(phone).startsWith('+') ? phone : `+91${normalizeMobileForVendor(phone)}`);
  if (!to || !to.startsWith('+')) {
    setLastSmsError('Twilio', null, null, 'Invalid phone format');
    return Promise.resolve({ sent: false, ...getLastSmsResult() });
  }
  const msg = `Your Picker App OTP is ${otp}. Valid for 5 minutes.`;
  const body = new URLSearchParams({ To: to, From: from, Body: msg }).toString();
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${sid}/Messages.json`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          if (ok) {
            lastSmsResult = { sent: true };
            lastSmsError = null;
            resolve({ sent: true });
          } else {
            let errMessage = null;
            try {
              const j = JSON.parse(data);
              errMessage = j?.message ?? j?.error_message ?? j?.more_info ?? null;
            } catch (_) {}
            setLastSmsError('Twilio', res.statusCode, data, errMessage || undefined);
            console.warn('[SMS] Twilio FAIL – HTTP', res.statusCode, 'body:', (data || '').slice(0, MAX_DEBUG_BODY_LENGTH));
            resolve({ sent: false, ...getLastSmsResult() });
          }
        });
      }
    );
    req.on('error', (err) => {
      setLastSmsError('Twilio', null, null, err?.message);
      resolve({ sent: false, ...getLastSmsResult() });
    });
    req.setTimeout(SMS_TIMEOUT_MS, () => {
      req.destroy();
      setLastSmsError('Twilio', null, null, 'Request timeout');
      resolve({ sent: false, ...getLastSmsResult() });
    });
    req.write(body);
    req.end();
  });
};

/** 2Factor TSMS – India, transactional SMS with custom message */
const sendVia2Factor = (phone, otp) => {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) return false;
  const msg = `Your Picker App OTP is ${otp}. Valid for 5 minutes. Do not share.`;
  const to = phone.length === 10 ? `91${phone}` : phone.replace(/\D/g, '').replace(/^0/, '91');
  const body = JSON.stringify({
    From: process.env.TWOFACTOR_SENDER_ID || 'PICKER',
    To: to,
    TemplateName: 'general_otp',
    Msg: msg,
  });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: '2factor.in',
        path: `/API/V1/${apiKey}/ADDON_SERVICES/SEND/TSMS`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            resolve(j?.Status === 'Success');
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('error', () => resolve(false));
    req.setTimeout(SMS_TIMEOUT_MS, () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
};

/**
 * Send OTP to phone. Provider order:
 * - If smsProvider === 'twilio': Twilio only.
 * - Else: config smsvendor → MSG91 (India DLT) → Fast2SMS → Twilio fallback.
 * Phone: 10-digit Indian number; country code +91 per config.
 * Returns { sent, errorCode?, userMessage?, internalLog? } for failure diagnostics.
 */
const sendOtpSms = async (phone, otp, otpExpiryMinutes = 5) => {
  const trimmed = String(phone).replace(/\D/g, '');
  if (!trimmed) {
    return { sent: false, errorCode: 'SMS_INVALID_NUMBER', userMessage: 'Invalid phone number. Phone must be numeric only.', internalLog: '[SMS] Invalid phone for send' };
  }

  lastSmsError = null;
  lastSmsResult = null;

  try {
    const provider = getSmsProvider();
    if (provider === 'twilio') {
      const r = await sendViaTwilio(trimmed, otp);
      if (r.sent) return r;
      return r;
    }
    // Config smsvendor (Spear UC / custom)
    if (getSmsVendorUrl()) {
      const r = await sendViaConfigSms(trimmed, otp);
      if (r.sent) return r;
      const msg91 = getMsg91Config();
      if (msg91.authKey) {
        const r2 = await sendViaMsg91(trimmed, otp, otpExpiryMinutes);
        if (r2.sent) return r2;
      }
      if (process.env.FAST2SMS_API_KEY) {
        const r2 = await sendViaFast2SMS(trimmed, otp);
        if (r2.sent) return r2;
      }
      const twilioConfig = getTwilioConfig();
      if (twilioConfig.accountSid && twilioConfig.authToken && twilioConfig.phoneNumber) {
        const r2 = await sendViaTwilio(trimmed, otp);
        if (r2.sent) return r2;
      }
      return getLastSmsResult() || { sent: false, userMessage: 'Unable to send OTP. Please try again.', internalLog: '[SMS] All providers failed' };
    }
    // MSG91 first if configured (India DLT)
    const msg91 = getMsg91Config();
    if (msg91.authKey) {
      const r = await sendViaMsg91(trimmed, otp, otpExpiryMinutes);
      if (r.sent) return r;
    }
    if (process.env.FAST2SMS_API_KEY) {
      const r = await sendViaFast2SMS(trimmed, otp);
      if (r.sent) return r;
    }
    const twilioConfig = getTwilioConfig();
    if (twilioConfig.accountSid && twilioConfig.authToken && twilioConfig.phoneNumber) {
      const r = await sendViaTwilio(trimmed, otp);
      if (r.sent) return r;
    }
    logOtp(trimmed, otp);
    return { sent: false, userMessage: 'SMS provider not configured. Contact support.', internalLog: '[SMS] No provider configured – OTP logged to console' };
  } catch (err) {
    setLastSmsError('sendOtpSms', null, null, err?.message);
    console.warn('[SMS] send failed:', err?.message);
    return getLastSmsResult() || { sent: false, userMessage: 'Unable to send OTP. Please try again.', internalLog: `[SMS] ${err?.message}` };
  }
};

module.exports = { sendOtpSms, getLastSmsError, getLastSmsResult };
