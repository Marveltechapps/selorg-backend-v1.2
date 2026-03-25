const nodemailer = require('nodemailer');

async function createTransporter() {
  if (
    process.env.EMAIL_HOST &&
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS
  ) {
    return {
      transporter: nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_PORT === '465',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
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

const BASE_STYLES = `
  body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
  .wrap{max-width:600px;margin:0 auto;background:#fff}
  .hdr{background:#4F46E5;padding:24px 32px}
  .hdr h1{color:#fff;margin:0;font-size:22px;font-weight:700}
  .hdr p{color:#C7D2FE;margin:4px 0 0;font-size:13px}
  .body{padding:32px}
  .txt{font-size:14px;color:#4B5563;line-height:1.7;margin-bottom:16px}
  .btn{display:inline-block;background:#4F46E5;color:#fff!important;
       padding:13px 28px;border-radius:8px;text-decoration:none;
       font-weight:700;font-size:15px;margin:16px 0}
  .info{background:#EFF6FF;border-left:4px solid #4F46E5;
        padding:14px;border-radius:4px;margin:16px 0;
        font-size:13px;color:#1E40AF}
  .warn{background:#FFFBEB;border-left:4px solid #F59E0B;
        padding:14px;border-radius:4px;margin:16px 0;
        font-size:13px;color:#92400E}
  .ok{background:#F0FDF4;border-left:4px solid #10B981;
      padding:14px;border-radius:4px;margin:16px 0;
      font-size:13px;color:#065F46}
  .quote{background:#EEF2FF;border-radius:8px;padding:14px;
         margin:16px 0;font-style:italic;color:#4338CA;font-size:14px}
  table.data{width:100%;border-collapse:collapse;margin:16px 0;
             font-size:14px}
  table.data th{background:#F9FAFB;padding:9px 12px;text-align:left;
                font-size:12px;color:#6B7280;
                border-bottom:1px solid #E5E7EB}
  table.data td{padding:9px 12px;border-bottom:1px solid #F3F4F6;
                color:#1F2937}
  .total-row td{font-weight:700;background:#F9FAFB}
  .ftr{background:#F9FAFB;padding:18px 32px;text-align:center;
       font-size:12px;color:#9CA3AF}
  .two-btn{display:flex;gap:10px;margin:16px 0}
  .btn-g{display:inline-block;background:#10B981;color:#fff!important;
         padding:11px 22px;border-radius:8px;text-decoration:none;
         font-weight:700;font-size:14px}
  .btn-r{display:inline-block;background:#EF4444;color:#fff!important;
         padding:11px 22px;border-radius:8px;text-decoration:none;
         font-weight:700;font-size:14px}
`;

const FOOTER = (year) => `
  <div class="ftr">
    © ${year} Selorg · Quick Commerce Platform<br>
    vendor@selorg.com
  </div>`;

function wrap(title, subtitle, bodyHtml) {
  return `<!DOCTYPE html><html><head><style>${BASE_STYLES}</style></head>
  <body><div class="wrap">
  <div class="hdr"><h1>SELORG</h1><p>${subtitle}</p></div>
  <div class="body">${bodyHtml}</div>
  ${FOOTER(new Date().getFullYear())}
  </div></body></html>`;
}

function getVendorInviteTemplate(d) {
  const subject = `You're invited to supply to ${d.companyName || 'Selorg'}`;
  const body = `
    <p class="txt">Hi <strong>${d.vendorName}</strong>,</p>
    <p class="txt">
      You have been invited to join the
      <strong>${d.companyName || 'Selorg'}</strong> supplier network.
    </p>
    ${
      d.personalMessage
        ? `<div class="quote">"${d.personalMessage}"</div>`
        : ''
    }
    ${
      d.category
        ? `<div class="info">
        Category: <strong>${d.category}</strong>
      </div>`
        : ''
    }
    <p class="txt">
      Complete your vendor profile — it takes about 10 minutes.
    </p>
    <a href="${d.inviteLink}" class="btn">
      Complete Your Vendor Profile →
    </a>
    <div class="warn">
      <strong>⏰ This invite expires in ${d.expiryDays || 7} days.</strong>
    </div>
    <p class="txt" style="font-size:12px;color:#9CA3AF">
      If you did not expect this, you can safely ignore it.
    </p>`;

  return {
    subject,
    htmlBody: wrap('Vendor Invite', 'Quick Commerce Supply Network', body),
    textBody: `Hi ${d.vendorName},\n\nYou are invited to supply to ${
      d.companyName || 'Selorg'
    }.\n\nComplete your profile: ${d.inviteLink}\n\nExpires in ${
      d.expiryDays || 7
    } days.`,
  };
}

function getDocumentRequestTemplate(d) {
  const subject = 'Action Required: Documents needed for your vendor profile';
  const docsRows = (d.requiredDocs || [])
    .map(
      (doc) => `<div style="padding:8px 0;border-bottom:1px solid #F3F4F6;
      font-size:13px;color:#1F2937;">⚠ ${doc}</div>`
    )
    .join('');
  const body = `
    <p class="txt">Hi <strong>${d.vendorName}</strong>,</p>
    <p class="txt">
      We need the following documents to complete your onboarding:
    </p>
    <div style="border:1px solid #E5E7EB;border-radius:8px;
         padding:8px 16px;margin:16px 0">${docsRows}</div>
    ${
      d.deadline
        ? `<div class="warn">
        <strong>📅 Submit by: ${d.deadline}</strong>
      </div>`
        : ''
    }
    ${
      d.notes
        ? `<div class="info">
        <strong>Note:</strong> ${d.notes}
      </div>`
        : ''
    }
    <a href="${d.dashboardLink || '#'}" class="btn">
      Upload Documents Now →
    </a>`;

  return {
    subject,
    htmlBody: wrap('Document Request', 'Document Upload Required', body),
    textBody: `Hi ${d.vendorName},\nDocuments needed:\n${
      (d.requiredDocs || []).join('\n')
    }\nDeadline: ${d.deadline || 'ASAP'}`,
  };
}

function getPOConfirmationTemplate(d) {
  const subject = `Purchase Order ${d.poNumber} — Please Confirm`;
  const rows = (d.items || [])
    .map(
      (i) => `<tr>
      <td>${i.sku || i.name}</td>
      <td>${i.qty}</td>
      <td>${i.unit || 'kg'}</td>
      <td>₹${i.unitPrice}</td>
      <td>₹${(i.qty * i.unitPrice).toLocaleString()}</td>
    </tr>`
    )
    .join('');
  const body = `
    <div class="ok">
      <strong style="font-size:17px">PO #${d.poNumber}</strong><br>
      <span style="color:#6B7280">Date: ${d.poDate}</span>
    </div>
    <p class="txt">Dear <strong>${d.vendorName}</strong>,</p>
    <p class="txt">Please find your purchase order below.</p>
    <table class="data">
      <thead><tr>
        <th>Item</th><th>Qty</th>
        <th>Unit</th><th>Price</th><th>Total</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="4" style="text-align:right">Total</td>
          <td style="color:#4F46E5">
            ₹${(d.totalValue || 0).toLocaleString()}
          </td>
        </tr>
      </tbody>
    </table>
    <div class="info">
      <strong>📦 Delivery Details</strong><br>
      Expected By: <strong>${d.deliveryDate}</strong><br>
      Deliver To: ${d.warehouseAddress}
      ${d.contactPerson ? `<br>Contact: ${d.contactPerson}` : ''}
    </div>
    <div class="two-btn">
      <a href="#confirm" class="btn-g">✓ Confirm PO</a>
      <a href="#issue" class="btn-r">⚠ Raise Issue</a>
    </div>`;

  return {
    subject,
    htmlBody: wrap('Purchase Order', 'PO Confirmation Required', body),
    textBody: `PO ${d.poNumber}\nVendor: ${d.vendorName}\nTotal: ₹${
      d.totalValue || 0
    }`,
  };
}

function getPaymentNotificationTemplate(d) {
  const subject = `Payment of ₹${(d.amount || 0).toLocaleString()} processed — ${
    d.referenceNumber
  }`;
  const body = `
    <div class="ok" style="text-align:center">
      <div style="font-size:36px">✓</div>
      <h2 style="color:#065F46;margin:8px 0">Payment Processed</h2>
      <div style="font-size:26px;font-weight:700;color:#1F2937">
        ₹${(d.amount || 0).toLocaleString()}
      </div>
    </div>
    <p class="txt">Hi <strong>${d.vendorName}</strong>,</p>
    <table class="data">
      <tr><td style="color:#6B7280">Date</td>
          <td><strong>${d.paymentDate}</strong></td></tr>
      <tr><td style="color:#6B7280">Reference</td>
          <td><strong>${d.referenceNumber}</strong></td></tr>
      <tr><td style="color:#6B7280">Method</td>
          <td>${d.paymentMethod || 'NEFT'}</td></tr>
      <tr><td style="color:#6B7280">Account</td>
          <td>****${String(d.bankAccount || 'XXXX').slice(-4)}</td></tr>
    </table>
    ${
      d.invoiceNumbers
        ? `<div class="info">
        Invoices: ${
          Array.isArray(d.invoiceNumbers)
            ? d.invoiceNumbers.join(', ')
            : d.invoiceNumbers
        }
      </div>`
        : ''
    }
    <p class="txt" style="font-size:12px;color:#9CA3AF">
      Queries: finance@selorg.com
    </p>`;

  return {
    subject,
    htmlBody: wrap('Payment', 'Payment Notification', body),
    textBody: `Payment ₹${d.amount} processed. Ref: ${d.referenceNumber}`,
  };
}

function getContractSentTemplate(d) {
  const subject = `Vendor Agreement Ready for Signature — ${d.contractId}`;
  const terms = (d.keyTerms || [])
    .map((t) => `<li style="margin-bottom:5px;color:#4B5563">${t}</li>`)
    .join('');
  const body = `
    <p class="txt">Hi <strong>${d.vendorName}</strong>,</p>
    <p class="txt">Your vendor agreement is ready for review and signature.</p>
    <table class="data">
      <tr><td style="color:#6B7280">Contract ID</td>
          <td><strong>${d.contractId}</strong></td></tr>
      <tr><td style="color:#6B7280">Valid From</td>
          <td>${d.validFrom}</td></tr>
      <tr><td style="color:#6B7280">Valid To</td>
          <td>${d.validTo}</td></tr>
      <tr><td style="color:#6B7280">Sign Before</td>
          <td style="color:#EF4444;font-weight:700">${d.signDeadline}</td></tr>
    </table>
    ${
      terms
        ? `<div class="info">
        <strong>Key Terms:</strong>
        <ul style="margin:8px 0 0;padding-left:18px">${terms}</ul>
      </div>`
        : ''
    }
    <a href="${d.contractLink || '#'}" class="btn">
      Review and Sign Agreement →
    </a>
    <div class="warn">
      <strong>⚠ Please sign before ${d.signDeadline}</strong>
    </div>`;

  return {
    subject,
    htmlBody: wrap('Contract', 'Agreement Ready for Signature', body),
    textBody: `Contract ${d.contractId}\nSign before: ${d.signDeadline}\nLink: ${
      d.contractLink || '#'
    }`,
  };
}

function getRejectionTemplate(d) {
  const subject = 'Update on your vendor application — Selorg';
  const reapplyDate = d.reapplyAfterDays
    ? new Date(Date.now() + d.reapplyAfterDays * 86400000).toLocaleDateString(
        'en-IN',
        { day: 'numeric', month: 'long', year: 'numeric' }
      )
    : null;

  const body = `
    <p class="txt">Hi <strong>${d.vendorName}</strong>,</p>
    <p class="txt">
      Thank you for your interest in supplying to Selorg. After
      careful review, we are unable to proceed at this time.
    </p>
    ${
      d.rejectionReason
        ? `<div style="background:#F9FAFB;border:1px solid #E5E7EB;
          border-radius:8px;padding:14px;margin:16px 0;font-size:13px">
        <strong style="color:#6B7280">Reason:</strong><br>
        <span style="color:#1F2937">${d.rejectionReason}</span>
      </div>`
        : ''
    }
    ${
      d.canReapply && reapplyDate
        ? `<div class="info">
        You may reapply after <strong>${d.reapplyAfterDays} days</strong>.<br>
        Earliest date: <strong>${reapplyDate}</strong>
      </div>`
        : `<p class="txt">We will keep your application on file.</p>`
    }
    <p class="txt">
      Questions:
      <a href="mailto:${d.contactEmail || 'vendor@selorg.com'}" style="color:#4F46E5">
        ${d.contactEmail || 'vendor@selorg.com'}
      </a>
    </p>`;

  return {
    subject,
    htmlBody: wrap('Application Update', 'Vendor Application', body),
    textBody: `Hi ${d.vendorName},\nReason: ${d.rejectionReason}\nContact: ${
      d.contactEmail || 'vendor@selorg.com'
    }`,
  };
}

async function sendEmail({ to, templateName, templateData, cc, bcc }) {
  const templates = {
    vendor_invite: getVendorInviteTemplate,
    document_request: getDocumentRequestTemplate,
    po_confirmation: getPOConfirmationTemplate,
    payment_notification: getPaymentNotificationTemplate,
    contract_sent: getContractSentTemplate,
    rejection: getRejectionTemplate,
  };

  const fn = templates[templateName];
  if (!fn) throw new Error(`Unknown template: ${templateName}`);

  const { subject, htmlBody, textBody } = fn(templateData);
  const { transporter, isEthereal } = await createTransporter();

  const info = await transporter.sendMail({
    from:
      process.env.EMAIL_FROM ||
      '"Selorg Vendor Team" <vendor@selorg.com>',
    to,
    cc,
    bcc,
    subject,
    html: htmlBody,
    text: textBody,
  });

  let previewUrl = null;
  if (isEthereal) {
    previewUrl = nodemailer.getTestMessageUrl(info);
    console.log('=== EMAIL PREVIEW ===');
    console.log('To:', to, '| Subject:', subject);
    console.log('Preview URL:', previewUrl);
    console.log('====================');
  }

  return {
    success: true,
    messageId: info.messageId,
    previewUrl,
  };
}

module.exports = {
  sendEmail,
  getVendorInviteTemplate,
  getDocumentRequestTemplate,
  getPOConfirmationTemplate,
  getPaymentNotificationTemplate,
  getContractSentTemplate,
  getRejectionTemplate,
};

