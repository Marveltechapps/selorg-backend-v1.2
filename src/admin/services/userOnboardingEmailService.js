const nodemailer = require('nodemailer');

const DEFAULT_FROM = '"Selorg Admin" <admin@selorg.com>';

async function createTransporter() {
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return {
      transporter: nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587', 10),
        secure: String(process.env.EMAIL_PORT || '587') === '465',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      }),
      isEthereal: false,
    };
  }

  const testAccount = await nodemailer.createTestAccount();
  return {
    transporter: nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    }),
    isEthereal: true,
  };
}

async function sendEmail({ to, subject, html, text }) {
  const { transporter, isEthereal } = await createTransporter();
  const info = await transporter.sendMail({
    from: process.env.ADMIN_EMAIL_FROM || DEFAULT_FROM,
    to,
    subject,
    html,
    text,
  });

  if (isEthereal) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      // eslint-disable-next-line no-console
      console.log(`[EMAIL PREVIEW] ${subject}: ${previewUrl}`);
    }
  }
}

async function sendAdminUserOtpEmail({ to, otp, expiresInMinutes = 10, requestedByEmail }) {
  const subject = 'Selorg Admin User Verification OTP';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="margin:0 0 12px 0">Verify new user email</h2>
      <p style="margin:0 0 16px 0">Use this OTP to continue user creation in Admin panel.</p>
      <div style="font-size:28px;letter-spacing:6px;font-weight:700;background:#f3f4f6;padding:14px 18px;border-radius:8px;display:inline-block">${otp}</div>
      <p style="margin:16px 0 8px 0">This OTP expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      ${
        requestedByEmail
          ? `<p style="margin:0;color:#6b7280">Requested by: ${requestedByEmail}</p>`
          : ''
      }
    </div>
  `;
  const text = `Your Selorg admin OTP is ${otp}. It expires in ${expiresInMinutes} minutes.`;
  await sendEmail({ to, subject, html, text });
}

async function sendAdminUserCreatedEmail({ to, name, roleName, department }) {
  const subject = 'Your Selorg Admin Account Is Created';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="margin:0 0 12px 0">Welcome to Selorg</h2>
      <p style="margin:0 0 12px 0">Hi ${name || 'User'}, your account has been created successfully.</p>
      <ul style="margin:0 0 16px 20px">
        <li>Email: <strong>${to}</strong></li>
        <li>Role: <strong>${roleName || 'N/A'}</strong></li>
        <li>Department: <strong>${department || 'N/A'}</strong></li>
      </ul>
      <p style="margin:0;color:#6b7280">Please use the password set during onboarding to sign in.</p>
    </div>
  `;
  const text = `Hi ${name || 'User'}, your Selorg account is created. Role: ${roleName || 'N/A'}, Department: ${department || 'N/A'}.`;
  await sendEmail({ to, subject, html, text });
}

async function sendAdminCreationConfirmationEmail({
  to,
  createdUserEmail,
  createdUserName,
  roleName,
  department,
}) {
  if (!to) return;
  const subject = 'User Created Successfully';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="margin:0 0 12px 0">User created successfully</h2>
      <p style="margin:0 0 12px 0">A new user has been created in Selorg Admin.</p>
      <ul style="margin:0 0 16px 20px">
        <li>Name: <strong>${createdUserName || 'N/A'}</strong></li>
        <li>Email: <strong>${createdUserEmail}</strong></li>
        <li>Role: <strong>${roleName || 'N/A'}</strong></li>
        <li>Department: <strong>${department || 'N/A'}</strong></li>
      </ul>
    </div>
  `;
  const text = `User created: ${createdUserName || 'N/A'} (${createdUserEmail}), role: ${roleName || 'N/A'}, department: ${department || 'N/A'}.`;
  await sendEmail({ to, subject, html, text });
}

module.exports = {
  sendAdminUserOtpEmail,
  sendAdminUserCreatedEmail,
  sendAdminCreationConfirmationEmail,
};
