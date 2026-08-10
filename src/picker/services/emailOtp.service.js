/**
 * Picker email OTP – fast transactional delivery (seconds, like SMS).
 *
 * Provider priority (auto): Resend + Brevo + SES + SendGrid in parallel race → SMTP fallback.
 * GoDaddy SMTP alone often takes 30–60s to reach Gmail; add BREVO_API_KEY or RESEND_API_KEY for instant delivery.
 */
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');

const APP_NAME = 'Selorg Picker';
const DEFAULT_FROM = `"${APP_NAME}" <admin@selorg.com>`;
const FAST_TIMEOUT_MS = Math.max(
  2000,
  Math.min(8000, parseInt(process.env.PICKER_EMAIL_FAST_TIMEOUT_MS || '6000', 10))
);
const SMTP_TIMEOUT_MS = Math.max(
  3000,
  Math.min(15000, parseInt(process.env.PICKER_EMAIL_SEND_TIMEOUT_MS || '9000', 10))
);

function getFromAddress() {
  return process.env.PICKER_EMAIL_FROM || process.env.ADMIN_EMAIL_FROM || process.env.EMAIL_FROM || DEFAULT_FROM;
}

function parseFromAddress(raw) {
  const from = String(raw || getFromAddress()).trim();
  const named = from.match(/^"([^"]+)"\s*<([^>]+)>$/);
  if (named) return { name: named[1].trim(), email: named[2].trim() };
  const bracketed = from.match(/^([^<]+)<([^>]+)>$/);
  if (bracketed) return { name: bracketed[1].trim(), email: bracketed[2].trim() };
  return { name: APP_NAME, email: from.replace(/[<>"]/g, '') };
}

function isSmtpConfigured() {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function isResendConfigured() {
  return !!String(process.env.RESEND_API_KEY || '').trim();
}

function isBrevoConfigured() {
  return !!String(process.env.BREVO_API_KEY || '').trim();
}

function isSendGridConfigured() {
  return !!String(process.env.SENDGRID_API_KEY || '').trim();
}

function isSesConfigured() {
  // Only use SES when explicitly enabled (IAM user must have ses:SendEmail + verified domain).
  if (String(process.env.PICKER_EMAIL_USE_SES || '').toLowerCase() !== 'true') return false;
  const key = process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  return !!(key && secret);
}

function hasFastProvider() {
  return isResendConfigured() || isBrevoConfigured() || isSendGridConfigured() || isSesConfigured();
}

function isEmailOtpConfigured() {
  return hasFastProvider() || isSmtpConfigured();
}

function getProviderMode() {
  return String(process.env.PICKER_EMAIL_PROVIDER || 'auto').toLowerCase();
}

let cachedTransporter = null;
let cachedTransporterKey = '';
let warmInFlight = null;
let sesClient = null;

function buildTransporterKey() {
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const tlsStrict = String(process.env.EMAIL_TLS_STRICT || '').toLowerCase() === 'true';
  return `${process.env.EMAIL_HOST}|${port}|${process.env.EMAIL_USER}|${tlsStrict}`;
}

async function createTransporter() {
  if (!isSmtpConfigured()) {
    return { transporter: null, configured: false };
  }

  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const tlsStrict = String(process.env.EMAIL_TLS_STRICT || '').toLowerCase() === 'true';
  const transporterKey = buildTransporterKey();

  if (!cachedTransporter || cachedTransporterKey !== transporterKey) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port,
      secure: port === 465,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 5000,
      greetingTimeout: 4000,
      socketTimeout: SMTP_TIMEOUT_MS,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: tlsStrict,
        minVersion: 'TLSv1.2',
        servername: process.env.EMAIL_HOST,
      },
    });
    cachedTransporterKey = transporterKey;
  }

  return { transporter: cachedTransporter, configured: true };
}

function getSesClient() {
  if (sesClient) return sesClient;
  const { SESClient } = require('@aws-sdk/client-ses');
  sesClient = new SESClient({
    region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return sesClient;
}

function warmSmtpConnection() {
  if (!isSmtpConfigured()) return Promise.resolve(false);
  if (warmInFlight) return warmInFlight;

  warmInFlight = createTransporter()
    .then(({ transporter }) => {
      if (!transporter) return false;
      return transporter.verify().then(() => {
        console.log('[Picker Email OTP] SMTP pool warmed');
        return true;
      });
    })
    .catch((err) => {
      console.warn(`[Picker Email OTP] SMTP warm-up skipped: ${err?.message || err}`);
      return false;
    })
    .finally(() => {
      warmInFlight = null;
    });

  return warmInFlight;
}

function logProviderStatus() {
  const fast = [];
  if (isResendConfigured()) fast.push('Resend');
  if (isBrevoConfigured()) fast.push('Brevo');
  if (isSendGridConfigured()) fast.push('SendGrid');
  if (isSesConfigured()) fast.push('AWS SES');
  if (fast.length > 0) {
    console.log(`[Picker Email OTP] Fast providers: ${fast.join(', ')} (target: inbox in seconds)`);
    return;
  }
  if (isSmtpConfigured()) {
    console.warn(
      '[Picker Email OTP] Only GoDaddy SMTP configured – Gmail may take 30–60s. Add BREVO_API_KEY (free) or RESEND_API_KEY for SMS-speed delivery.'
    );
  }
}

function buildOtpEmailHtml(otp, expiresInMinutes, appName) {
  const brand = appName || APP_NAME;
  const spacedOtp = String(otp).split('').join(' ');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background-color:#EFF6FF;padding:28px 32px 22px;text-align:center;border-bottom:1px solid #DBEAFE;">
              <div style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">${brand}</div>
              <div style="font-size:14px;color:#6B7280;margin-top:6px;">Secure sign-in verification</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 36px;text-align:center;">
              <p style="margin:0 0 28px;font-size:15px;line-height:24px;color:#6B7280;">
                Enter this 4-digit code to verify your email and sign in to ${brand}.
              </p>
              <div style="display:inline-block;border:2px solid #F2C94C;border-radius:12px;padding:18px 48px;background:#FFFFFF;">
                <span style="font-size:36px;font-weight:700;color:#111827;letter-spacing:12px;">${spacedOtp}</span>
              </div>
              <p style="margin:28px 0 0;font-size:13px;line-height:20px;color:#9CA3AF;">
                This code expires in <strong style="color:#6B7280;">${expiresInMinutes} minutes</strong>.
                If you did not request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function getResendReplyTo() {
  return (process.env.PICKER_EMAIL_REPLY_TO || 'admin@selorg.com').trim();
}

/** True when the brand string is the customer app (not picker/rider). */
function isCustomerBrand(brandName) {
  const brand = String(brandName || '').trim();
  if (!brand) return false;
  if (/customer/i.test(brand)) return true;
  const customerApp = String(process.env.CUSTOMER_APP_NAME || 'Selorg').trim();
  return brand.toLowerCase() === customerApp.toLowerCase();
}

function buildVerifiedFromForPayload(payload) {
  const brand = parseFromAddress(payload && payload.from);
  const brandName = brand.name || APP_NAME;

  if (isCustomerBrand(brandName)) {
    const customerVerified = (
      process.env.CUSTOMER_RESEND_VERIFIED_FROM ||
      process.env.CUSTOMER_RESEND_FROM ||
      process.env.CUSTOMER_EMAIL_FROM ||
      ''
    ).trim();
    if (customerVerified) {
      const verified = parseFromAddress(customerVerified);
      if (verified.email) {
        return `"${brandName}" <${verified.email}>`;
      }
    }
  }

  const riderVerified = (process.env.RIDER_RESEND_VERIFIED_FROM || '').trim();
  if (/rider/i.test(brandName) && riderVerified) {
    return riderVerified;
  }

  const verified = parseFromAddress(process.env.RESEND_VERIFIED_FROM || '');
  if (!verified.email) return '';
  const name = brand.name || verified.name || APP_NAME;
  return `"${name}" <${verified.email}>`;
}

function buildAppEmailFrom(appName, explicitFrom) {
  if (explicitFrom) return explicitFrom;
  const brand = String(appName || APP_NAME).trim();

  if (isCustomerBrand(brand)) {
    const customerFrom = (
      process.env.CUSTOMER_RESEND_VERIFIED_FROM ||
      process.env.CUSTOMER_RESEND_FROM ||
      process.env.CUSTOMER_EMAIL_FROM ||
      ''
    ).trim();
    if (customerFrom) return customerFrom;
  }

  if (/rider/i.test(brand)) {
    const riderFrom = (process.env.RIDER_RESEND_FROM || process.env.RIDER_EMAIL_FROM || '').trim();
    if (riderFrom) return riderFrom;
  }

  const email = parseFromAddress(getFromAddress()).email;
  return `"${brand}" <${email}>`;
}

async function sendViaResend(payload, fromAddress) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;

  const from = fromAddress || payload.from || process.env.RESEND_FROM || getFromAddress();
  const started = Date.now();
  const response = await withTimeout(
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        reply_to: getResendReplyTo(),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    }),
    FAST_TIMEOUT_MS,
    'Resend'
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Resend HTTP ${response.status}`);
  }

  console.log(`[Picker Email OTP] Resend (${from}) → ${payload.to} in ${Date.now() - started}ms`);
  return { sent: true, channel: 'email', configured: true, provider: 'resend', messageId: body?.id };
}

/** Try primary from; on domain error use verified Resend sender with same brand name. */
async function sendViaResendSmart(payload) {
  const primaryFrom = payload.from || process.env.RESEND_FROM || getFromAddress();
  const verifiedFallback = buildVerifiedFromForPayload(payload);

  try {
    return await sendViaResend(payload, primaryFrom);
  } catch (err) {
    const msg = err?.message || '';
    const domainIssue = /domain is not verified|not verified/i.test(msg);
    if (!domainIssue || !verifiedFallback || verifiedFallback === primaryFrom) {
      throw err;
    }
    console.warn(
      `[Picker Email OTP] Resend primary sender unavailable; using verified address (${parseFromAddress(verifiedFallback).name || 'fallback'})`
    );
    return sendViaResend(payload, verifiedFallback);
  }
}

async function sendViaBrevo(payload) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) return null;

  const sender = parseFromAddress(payload.from || process.env.BREVO_FROM || getFromAddress());
  const started = Date.now();
  const response = await withTimeout(
    fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
      }),
    }),
    FAST_TIMEOUT_MS,
    'Brevo'
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Brevo HTTP ${response.status}`);
  }

  console.log(`[Picker Email OTP] Brevo → ${payload.to} in ${Date.now() - started}ms`);
  return { sent: true, channel: 'email', configured: true, provider: 'brevo', messageId: body?.messageId };
}

async function sendViaSendGrid(payload) {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
  if (!apiKey) return null;

  const from = parseFromAddress(payload.from || process.env.SENDGRID_FROM || getFromAddress());
  const started = Date.now();
  const response = await withTimeout(
    fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from,
        subject: payload.subject,
        content: [
          { type: 'text/plain', value: payload.text },
          { type: 'text/html', value: payload.html },
        ],
      }),
    }),
    FAST_TIMEOUT_MS,
    'SendGrid'
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `SendGrid HTTP ${response.status}`);
  }

  console.log(`[Picker Email OTP] SendGrid → ${payload.to} in ${Date.now() - started}ms`);
  return { sent: true, channel: 'email', configured: true, provider: 'sendgrid' };
}

async function sendViaSes(payload) {
  if (!isSesConfigured()) return null;

  const { SendEmailCommand } = require('@aws-sdk/client-ses');
  const from = payload.from || process.env.AWS_SES_FROM || getFromAddress();
  const started = Date.now();
  const result = await withTimeout(
    getSesClient().send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [payload.to] },
        Message: {
          Subject: { Data: payload.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: payload.html, Charset: 'UTF-8' },
            Text: { Data: payload.text, Charset: 'UTF-8' },
          },
        },
      })
    ),
    FAST_TIMEOUT_MS,
    'AWS SES'
  );

  console.log(`[Picker Email OTP] AWS SES → ${payload.to} in ${Date.now() - started}ms`);
  return { sent: true, channel: 'email', configured: true, provider: 'ses', messageId: result?.MessageId };
}

function resolveMailFrom(payload) {
  return payload.from || getFromAddress();
}

async function sendViaSmtp(payload) {
  const { transporter } = await createTransporter();
  if (!transporter) {
    return { sent: false, configured: false, userMessage: 'Email OTP is not configured on the server.' };
  }

  const started = Date.now();
  const info = await withTimeout(
    transporter.sendMail({
      from: resolveMailFrom(payload),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      priority: 'high',
      headers: {
        'X-Priority': '1',
        Importance: 'high',
        'X-MSMail-Priority': 'High',
      },
    }),
    SMTP_TIMEOUT_MS,
    'SMTP'
  );

  console.log(
    `[Picker Email OTP] SMTP accepted ${payload.to} in ${Date.now() - started}ms (messageId: ${info.messageId || 'n/a'})`
  );
  return { sent: true, channel: 'email', configured: true, provider: 'smtp', messageId: info.messageId };
}

/**
 * Race all configured fast HTTP/API providers; first success wins.
 */
async function raceFastProviders(payload) {
  const runners = [];
  if (isResendConfigured()) runners.push(() => sendViaResendSmart(payload));
  if (isBrevoConfigured()) runners.push(() => sendViaBrevo(payload));
  if (isSendGridConfigured()) runners.push(() => sendViaSendGrid(payload));
  if (isSesConfigured()) runners.push(() => sendViaSes(payload));

  if (runners.length === 0) return null;

  return new Promise((resolve, reject) => {
    let settled = false;
    let pending = runners.length;
    const errors = [];

    runners.forEach((run) => {
      run()
        .then((result) => {
          if (!settled && result?.sent) {
            settled = true;
            resolve(result);
          }
        })
        .catch((err) => {
          errors.push(err?.message || String(err));
        })
        .finally(() => {
          pending -= 1;
          if (!settled && pending === 0) {
            reject(new Error(errors.join(' | ') || 'All fast providers failed'));
          }
        });
    });

    setTimeout(() => {
      if (!settled) {
        reject(new Error(`Fast providers timed out after ${FAST_TIMEOUT_MS}ms`));
      }
    }, FAST_TIMEOUT_MS + 500);
  });
}

/**
 * @param {{ to: string, otp: string, expiresInMinutes?: number, appName?: string, from?: string }} params
 */
async function sendPickerEmailOtp({ to, otp, expiresInMinutes = 5, appName = APP_NAME, from }) {
  const subject = `${appName} – Your verification code`;
  const html = buildOtpEmailHtml(otp, expiresInMinutes, appName);
  const text = `Your ${appName} verification code is ${otp}. It expires in ${expiresInMinutes} minutes.`;
  const payload = {
    to,
    subject,
    html,
    text,
    from: buildAppEmailFrom(appName, from),
  };

  if (!isEmailOtpConfigured()) {
    return {
      sent: false,
      configured: false,
      userMessage: 'Email OTP is not configured on the server.',
    };
  }

  const mode = getProviderMode();

  if (hasFastProvider()) {
    try {
      const fastResult = await raceFastProviders(payload);
      if (fastResult?.sent) return fastResult;
    } catch (err) {
      console.warn(`[Picker Email OTP] Fast providers failed for ${to}: ${err?.message}`);
      if (mode === 'fast') {
        return {
          sent: false,
          configured: true,
          userMessage: 'Failed to send OTP email. Please try again.',
          internalError: err?.message,
        };
      }
    }
  } else if (mode === 'fast') {
    return {
      sent: false,
      configured: false,
      userMessage:
        'Instant email OTP is not configured. Add BREVO_API_KEY or RESEND_API_KEY to the server environment.',
      internalError: 'PICKER_EMAIL_PROVIDER=fast but no fast provider configured',
    };
  }

  if (isSmtpConfigured()) {
    return sendViaSmtp(payload);
  }

  return {
    sent: false,
    configured: true,
    userMessage: 'Failed to send OTP email. Please try again.',
    internalError: 'No email provider available',
  };
}

function buildTransactionalEmailHtml(title, body, appName) {
  const brand = appName || APP_NAME;
  const safeTitle = String(title || 'Notification').replace(/</g, '&lt;');
  const safeBody = String(body || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background-color:#ECFDF5;padding:28px 32px 22px;text-align:center;border-bottom:1px solid #D1FAE5;">
              <div style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">${brand}</div>
              <div style="font-size:14px;color:#6B7280;margin-top:6px;">Account notification</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;font-size:20px;line-height:28px;color:#111827;">${safeTitle}</h1>
              <p style="margin:0;font-size:15px;line-height:24px;color:#4B5563;">${safeBody}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;font-size:12px;line-height:18px;color:#9CA3AF;">
              You received this email because email notifications are enabled in your Selorg account settings.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generic transactional email (orders, payments, wallet, support).
 * Reuses the same Resend/Brevo/SendGrid/SES/SMTP stack as OTP — OTP delivery
 * is not affected by customer notificationPreferences.email.
 *
 * @param {{ to: string, subject: string, text: string, html?: string, appName?: string, from?: string }} params
 */
async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
  appName = 'Selorg',
  from,
}) {
  const destination = String(to || '').trim();
  if (!destination || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
    return { sent: false, configured: true, userMessage: 'Invalid email address.' };
  }

  const payload = {
    to: destination,
    subject: String(subject || 'Selorg notification').slice(0, 200),
    text: String(text || ''),
    html: html || buildTransactionalEmailHtml(subject, text, appName),
    from: buildAppEmailFrom(appName, from),
  };

  if (!isEmailOtpConfigured()) {
    return {
      sent: false,
      configured: false,
      userMessage: 'Email is not configured on the server.',
    };
  }

  const mode = getProviderMode();

  if (hasFastProvider()) {
    try {
      const fastResult = await raceFastProviders(payload);
      if (fastResult?.sent) return fastResult;
    } catch (err) {
      console.warn(`[Transactional Email] Fast providers failed for ${destination}: ${err?.message}`);
      if (mode === 'fast') {
        return {
          sent: false,
          configured: true,
          userMessage: 'Failed to send email. Please try again.',
          internalError: err?.message,
        };
      }
    }
  }

  if (isSmtpConfigured()) {
    return sendViaSmtp(payload);
  }

  return {
    sent: false,
    configured: true,
    userMessage: 'Failed to send email. Please try again.',
    internalError: 'No email provider available',
  };
}

logProviderStatus();

module.exports = {
  sendPickerEmailOtp,
  sendTransactionalEmail,
  warmSmtpConnection,
  logProviderStatus,
  APP_NAME,
  isSmtpConfigured,
  isResendConfigured,
  isBrevoConfigured,
  isSesConfigured,
  hasFastProvider,
  isEmailOtpConfigured,
};
