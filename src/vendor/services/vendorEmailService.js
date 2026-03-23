const nodemailer = require('nodemailer');

/**
 * Sends an email to a vendor contact when SMTP is configured via env.
 * Env: VENDOR_SMTP_HOST, VENDOR_SMTP_PORT (default 587), VENDOR_SMTP_USER, VENDOR_SMTP_PASS,
 *      VENDOR_SMTP_FROM (From address), VENDOR_SMTP_SECURE (optional, "true" for 465)
 */
async function sendVendorNotification({ to, subject, text }) {
  const host = process.env.VENDOR_SMTP_HOST;
  if (!host || !String(to || '').trim()) {
    return { sent: false, reason: 'smtp_not_configured_or_missing_recipient' };
  }

  const port = parseInt(process.env.VENDOR_SMTP_PORT || '587', 10);
  const secure = String(process.env.VENDOR_SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const user = process.env.VENDOR_SMTP_USER || '';
  const pass = process.env.VENDOR_SMTP_PASS || '';
  const from = process.env.VENDOR_SMTP_FROM || user || 'noreply@localhost';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to: String(to).trim(),
    subject: String(subject || '').trim() || 'Message from procurement',
    text: String(text || '').trim(),
  });

  return { sent: true };
}

module.exports = { sendVendorNotification };
