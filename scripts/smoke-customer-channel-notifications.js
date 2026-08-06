/**
 * Live smoke test for customer SMS / WhatsApp / Email notification channels.
 *
 * Usage (from selorg-backend-v1.2):
 *   node scripts/smoke-customer-channel-notifications.js
 *
 * Respects CUSTOMER_NOTIF_*_TO overrides from .env.
 * Does NOT touch OTP flows.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const title = 'Order Placed';
  const body = 'Smoke test: your order #TEST-001 has been placed successfully.';
  const type = 'ORDER_PLACED';

  const smsTo = String(process.env.CUSTOMER_NOTIF_SMS_TO || '9444183378').replace(/\D/g, '').slice(-10);
  const waTo = String(process.env.CUSTOMER_NOTIF_WHATSAPP_TO || '9444183378').replace(/\D/g, '').slice(-10);
  const emailTo = String(process.env.CUSTOMER_NOTIF_EMAIL_TO || 'admin@selorg.com')
    .trim()
    .replace(/^mailto:/i, '');

  console.log('Destinations:', { smsTo, waTo, emailTo });

  const { sendPickerTransactionalSms, sendTransactionalWhatsApp } = require('../src/picker/services/sms.service');
  const { sendTransactionalEmail } = require('../src/picker/services/emailOtp.service');

  const text = `Selorg: ${title} — ${body}`;

  console.log('\n--- SMS ---');
  const sms = await sendPickerTransactionalSms(smsTo, text);
  console.log(sms);

  console.log('\n--- WhatsApp ---');
  const wa = await sendTransactionalWhatsApp(waTo, text);
  console.log(wa);

  console.log('\n--- Email ---');
  const email = await sendTransactionalEmail({
    to: emailTo,
    subject: title,
    text: body,
    appName: process.env.CUSTOMER_APP_NAME || 'Selorg',
  });
  console.log(email);

  const ok = !!(sms.sent || wa.sent || email.sent);
  console.log('\nSummary:', { sms: !!sms.sent, whatsapp: !!wa.sent, email: !!email.sent });
  if (!ok) {
    console.error('No channel delivered successfully. Check Twilio/Resend/SMTP credentials.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
