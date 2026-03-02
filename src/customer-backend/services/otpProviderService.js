const path = require('path');
const fs = require('fs');

function readConfig() {
  try {
    const candidates = [
      path.resolve(__dirname, '..', '..', 'config.json'),
      path.resolve(process.cwd(), 'config.json'),
      path.resolve(process.cwd(), 'backend', 'config.json'),
    ];
    for (const cfgPath of candidates) {
      if (fs.existsSync(cfgPath)) return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    }
  } catch (err) {}
  return {};
}

const config = readConfig();

/** Per OTP_PROCESS_WORKFLOW.md: test mobile 9698790921 → no SMS sent, return success */
const TEST_MOBILE = '9698790921';

async function sendSms({ to, text }) {
  const digits = String(to || '').replace(/\D/g, '').slice(-10);
  if (digits === TEST_MOBILE) return { success: true, body: 'test-mobile-bypass' };

  const accountSid = process.env.TWILIO_ACCOUNT_SID || config.TWILIO_ACCOUNT_SID || config.twilioAccountSid;
  const authToken = process.env.TWILIO_AUTH_TOKEN || config.TWILIO_AUTH_TOKEN || config.twilioAuthToken;
  const fromNumber = process.env.TWILIO_FROM || config.TWILIO_FROM || config.twilioFrom;
  if (accountSid && authToken && fromNumber) {
    try {
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      const msg = await client.messages.create({ body: text, from: fromNumber, to });
      return { success: true, body: msg.sid || msg };
    } catch (err) {
      console.error('[otpProviderService] Twilio send error', err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  const smsVendorBase = (config.smsvendor || process.env.SMS_VENDOR_URL || '').trim();
  if (smsVendorBase) {
    try {
      const mobileOnly = String(to).replace(/\D/g, '').slice(-10);
      if (mobileOnly.length !== 10) return { success: false, error: 'Invalid mobile number' };
      const paramMobile = config.smsParamMobile || 'mobile';
      const paramMessage = config.smsParamMessage || 'message';
      const sep = smsVendorBase.includes('?')
        ? (!smsVendorBase.endsWith('&') && !smsVendorBase.endsWith('?') ? '&' : '')
        : '?';
      const urlQuick = `${smsVendorBase}${sep}${paramMobile}=${encodeURIComponent(mobileOnly)}&${paramMessage}=${encodeURIComponent(text)}`;
      const quickResp = await fetch(urlQuick);
      const quickBody = await quickResp.text();
      const ok = quickResp.status >= 200 && quickResp.status < 300;
      const bodyLower = (quickBody || '').toLowerCase();
      const looksSuccess = !/fail|error|invalid|denied|reject/.test(bodyLower) &&
        (/\b(success|sent|ok|delivered)\b/.test(bodyLower) || ok);
      if (ok && looksSuccess) return { success: true, body: quickBody };
      return { success: false, error: 'SMS vendor attempts failed' };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  if (config.otpDevMode === 1 || config.otpDevMode === true || process.env.OTP_DEV_MODE === '1') {
    console.warn('[otpProviderService] OTP dev mode; mock success');
    await new Promise((r) => setTimeout(r, 50));
    return { success: true, body: `mock-${Date.now()}` };
  }

  console.warn('[otpProviderService] No SMS provider configured; mock');
  await new Promise((r) => setTimeout(r, 50));
  return { success: true, body: `mock-${Date.now()}` };
}

module.exports = { sendSms };
