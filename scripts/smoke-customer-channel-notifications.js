/**
 * Live smoke test for customer SMS / WhatsApp / Email notification channels.
 *
 * Usage (from selorg-backend-v1.2):
 *   node scripts/smoke-customer-channel-notifications.js
 *   EMAIL_ONLY=1 node scripts/smoke-customer-channel-notifications.js
 *
 * Destinations (safe defaults for ops testing — never blast real customers):
 *   CUSTOMER_NOTIF_EMAIL_TO (default admin@selorg.com)
 *   CUSTOMER_NOTIF_SMS_TO / CUSTOMER_NOTIF_WHATSAPP_TO
 *
 * Does NOT touch OTP flows or place real orders.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const emailOnly =
    String(process.env.EMAIL_ONLY || '').toLowerCase() === '1' ||
    String(process.env.EMAIL_ONLY || '').toLowerCase() === 'true';
  const title = 'Order Placed';
  const body = 'Smoke test: your order #TEST-001 has been placed successfully.';
  const type = 'ORDER_PLACED';

  const smsTo = String(process.env.CUSTOMER_NOTIF_SMS_TO || '9444183378')
    .replace(/\D/g, '')
    .slice(-10);
  const waTo = String(process.env.CUSTOMER_NOTIF_WHATSAPP_TO || '9444183378')
    .replace(/\D/g, '')
    .slice(-10);
  const emailTo = String(process.env.CUSTOMER_NOTIF_EMAIL_TO || 'admin@selorg.com')
    .trim()
    .replace(/^mailto:/i, '');

  console.log('Mode:', emailOnly ? 'EMAIL_ONLY' : 'ALL_CHANNELS');
  console.log('Destinations:', emailOnly ? { emailTo } : { smsTo, waTo, emailTo });
  console.log('Notification type (smoke):', type);

  const { sendTransactionalEmail } = require('../src/picker/services/emailOtp.service');

  let sms = { sent: false, skipped: true };
  let wa = { sent: false, skipped: true };

  if (!emailOnly) {
    const {
      sendPickerTransactionalSms,
      sendTransactionalWhatsApp,
    } = require('../src/picker/services/sms.service');
    const text = `Selorg: ${title} — ${body}`;

    console.log('\n--- SMS ---');
    sms = await sendPickerTransactionalSms(smsTo, text);
    console.log({
      sent: !!sms.sent,
      configured: sms.configured,
      provider: sms.provider,
      error: sms.userMessage || sms.internalLog || sms.error,
    });

    console.log('\n--- WhatsApp ---');
    wa = await sendTransactionalWhatsApp(waTo, text);
    console.log({
      sent: !!wa.sent,
      configured: wa.configured,
      provider: wa.provider,
      error: wa.userMessage || wa.internalLog || wa.error,
    });
  }

  console.log('\n--- Email ---');
  const email = await sendTransactionalEmail({
    to: emailTo,
    subject: title,
    text: body,
    appName: process.env.CUSTOMER_APP_NAME || 'Selorg',
  });
  console.log({
    sent: !!email.sent,
    configured: email.configured,
    provider: email.provider,
    messageId: email.messageId,
    error: email.userMessage || email.internalError || email.error,
  });

  const ok = emailOnly ? !!email.sent : !!(sms.sent || wa.sent || email.sent);
  console.log('\nSummary:', {
    sms: emailOnly ? 'skipped' : !!sms.sent,
    whatsapp: emailOnly ? 'skipped' : !!wa.sent,
    email: !!email.sent,
  });
  if (!ok) {
    console.error(
      emailOnly
        ? 'Email was not accepted. Check Resend/SMTP credentials and verified From domain.'
        : 'No channel delivered successfully. Check Twilio/Resend/SMTP credentials.'
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
