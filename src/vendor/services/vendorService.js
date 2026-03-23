const Vendor = require('../models/Vendor');
const Job = require('../models/Job');
const { v4: uuidv4 } = require('uuid');
const cacheService = require('../../core/services/cache.service');
const { sendVendorNotification } = require('./vendorEmailService');
const { mergeHubFilter, getDefaultHubKey, hubFieldsForCreate } = require('../constants/hubScope');

const PAYMENT_TERMS = Vendor.PAYMENT_TERMS || ['30 days', '45 days', '60 days'];

async function invalidateVendorCaches() {
  try {
    await cacheService.delPattern('cache:*vendor/vendors*');
  } catch (_) {
    /* non-fatal */
  }
}

function normalizeVendorCreatePayload(payload) {
  const p = payload || {};
  const vendorName = String(p.vendorName ?? p.name ?? '').trim();
  const vendorCode = String(p.vendorCode ?? p.code ?? '').trim();
  const gstinRaw = p.taxInfo?.gstin ?? p.taxInfo?.GSTIN ?? p.metadata?.gstNumber ?? '';
  const gstin = String(gstinRaw).trim();
  const paymentTermsRaw = p.paymentTerms ?? p.metadata?.paymentTerms ?? '';
  const paymentTerms = String(paymentTermsRaw).trim();
  const currencyRaw = String(p.currencyCode ?? 'INR').trim().toUpperCase() || 'INR';
  const currencyCode = currencyRaw.slice(0, 3);

  const addr = p.address || {};
  const line1 = String(addr.line1 ?? '').trim();
  const line2 = addr.line2 != null && String(addr.line2).trim() !== '' ? String(addr.line2).trim() : null;
  const line3 = addr.line3 != null && String(addr.line3).trim() !== '' ? String(addr.line3).trim() : null;
  const city = String(addr.city ?? '').trim();
  const state = String(addr.state ?? '').trim();
  const country = String(addr.country ?? 'India').trim() || 'India';
  const zipCode = String(addr.zipCode ?? addr.pincode ?? '').trim();

  const c = p.contact || {};
  const contactName = String(c.name ?? '').trim();
  const phone = String(c.phone ?? '').trim();
  const email = String(c.email ?? '').trim().toLowerCase();

  return {
    vendorName,
    vendorCode,
    taxInfo: { gstin },
    paymentTerms,
    currencyCode,
    address: { line1, line2, line3, city, state, country, zipCode },
    contact: { name: contactName, phone, email },
    status: p.status || 'pending',
    onboarding: p.onboarding,
    metadata: p.metadata,
  };
}

function validateVendorCreate(n) {
  const errs = [];
  if (!n.vendorCode) errs.push('vendorCode is required');
  if (!n.vendorName) errs.push('vendorName is required');
  if (n.vendorName.length > 100) errs.push('vendorName must be at most 100 characters');
  const status = String(n.status || '').toLowerCase();
  const isDraft = status === 'draft';

  // Draft vendors may be saved with incomplete wizard data.
  if (!isDraft) {
    if (!n.taxInfo.gstin) errs.push('taxInfo.gstin is required');

    const PAYMENT_TERM_CODES = ['advance', 'net7', 'net15', 'net30', 'net45', 'cod'];
    const allowedPaymentTerms = [...PAYMENT_TERMS, ...PAYMENT_TERM_CODES];
    if (!allowedPaymentTerms.includes(n.paymentTerms)) {
      errs.push(`paymentTerms must be one of: ${allowedPaymentTerms.join(', ')}`);
    }

    if (!n.address.line1) errs.push('address.line1 is required');
    if (!n.address.city) errs.push('address.city is required');
    if (!n.address.state) errs.push('address.state is required');
    if (!n.address.country) errs.push('address.country is required');
    if (!n.address.zipCode) errs.push('address.zipCode is required');

    if (!n.contact.name) errs.push('contact.name is required');
    if (!n.contact.phone) errs.push('contact.phone is required');
    if (!n.contact.email) errs.push('contact.email is required');
  }

  // Only validate email format if it's present (drafts may omit it).
  if (n.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.contact.email)) {
    errs.push('contact.email must be a valid email');
  }
  return errs;
}

async function createVendor(payload) {
  const n = normalizeVendorCreatePayload(payload);
  const validationErrors = validateVendorCreate(n);
  if (validationErrors.length) {
    const err = new Error(validationErrors.join('; '));
    err.status = 400;
    throw err;
  }

  const dupCode = await Vendor.findOne(
    mergeHubFilter({
      $or: [{ vendorCode: n.vendorCode }, { code: n.vendorCode }],
    })
  ).lean();
  if (dupCode) {
    const err = new Error(`Vendor code '${n.vendorCode}' already exists`);
    err.status = 409;
    throw err;
  }

  if (n.contact.email) {
    const dupEmail = await Vendor.findOne({ 'contact.email': n.contact.email }).lean();
    if (dupEmail) {
      const err = new Error(`A vendor with email '${n.contact.email}' already exists`);
      err.status = 409;
      throw err;
    }
  }

  if (n.contact.phone) {
    const dupPhone = await Vendor.findOne(mergeHubFilter({ 'contact.phone': n.contact.phone })).lean();
    if (dupPhone) {
      const err = new Error(`A vendor with phone '${n.contact.phone}' already exists`);
      err.status = 409;
      throw err;
    }
  }

  const vendor = new Vendor({
    ...hubFieldsForCreate(),
    vendorCode: n.vendorCode,
    vendorName: n.vendorName,
    name: n.vendorName,
    code: n.vendorCode,
    taxInfo: n.taxInfo,
    paymentTerms: n.paymentTerms,
    currencyCode: n.currencyCode,
    address: {
      line1: n.address.line1,
      line2: n.address.line2,
      line3: n.address.line3,
      city: n.address.city,
      state: n.address.state,
      country: n.address.country,
      zipCode: n.address.zipCode,
    },
    contact: {
      name: n.contact.name,
      phone: n.contact.phone,
      email: n.contact.email,
    },
    status: n.status,
    onboarding: n.onboarding,
    metadata: n.metadata,
  });

  await vendor.save();
  await invalidateVendorCaches();
  return vendor.toObject();
}

async function listVendors(query) {
  const page = Math.max(1, parseInt(query.page || 1, 10));
  const limit = Math.max(1, parseInt(query.limit || query.pageSize || 25, 10));
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.search) {
    const esc = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(esc, 'i');
    filter.$or = [
      { name: rx },
      { vendorName: rx },
      { code: rx },
      { vendorCode: rx },
      { 'contact.email': rx },
      { 'contact.phone': rx },
    ];
  }
  const scoped = mergeHubFilter(filter);
  const total = await Vendor.countDocuments(scoped);
  const data = await Vendor.find(scoped)
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();
  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data,
  };
}

async function getVendorById(vendorId) {
  const vendor = await Vendor.findOne(mergeHubFilter({ _id: vendorId })).lean();
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.status = 404;
    throw err;
  }
  return vendor;
}

async function updateVendor(vendorId, payload) {
  const vendor = await Vendor.findOne(mergeHubFilter({ _id: vendorId }));
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.status = 404;
    throw err;
  }
  const patch = { ...payload };
  if (patch.metadata != null && typeof patch.metadata === 'object' && !Array.isArray(patch.metadata)) {
    const existing =
      vendor.metadata && typeof vendor.metadata === 'object' && !Array.isArray(vendor.metadata)
        ? { ...vendor.metadata }
        : {};
    patch.metadata = { ...existing, ...patch.metadata };
  }

  // Backward compatibility: if the wizard stored legacy fields inside
  // `metadata.*`, project them onto top-level fields the rest of the code uses.
  if (patch.metadata != null && typeof patch.metadata === 'object' && !Array.isArray(patch.metadata)) {
    const meta = patch.metadata;
    if (patch.taxInfo == null && meta.gstNumber != null) {
      patch.taxInfo = { gstin: String(meta.gstNumber) };
    }
    if (patch.paymentTerms == null && meta.paymentTerms != null) {
      patch.paymentTerms = String(meta.paymentTerms);
    }
  }

  Object.assign(vendor, patch);
  if (payload.vendorName != null && payload.name == null) vendor.name = payload.vendorName;
  if (payload.vendorCode != null && payload.code == null) vendor.code = payload.vendorCode;
  await vendor.save();
  await invalidateVendorCaches();
  return vendor.toObject();
}

async function patchVendor(vendorId, payload) {
  return updateVendor(vendorId, payload);
}

async function performAction(vendorId, actionRequest) {
  const vendor = await Vendor.findOne(mergeHubFilter({ _id: vendorId }));
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.status = 404;
    throw err;
  }
  const previousStatus = vendor.status;
  const { action } = actionRequest;
  if (action === 'approve') vendor.status = 'active';
  else if (action === 'reject') vendor.status = 'rejected';
  else if (action === 'reactivate') vendor.status = 'active';
  else if (action === 'archive') vendor.status = 'archived';
  else if (action === 'send_message') {
    const subject = String(actionRequest.subject || '').trim();
    const message = String(actionRequest.message || '').trim();
    if (!subject || !message) {
      const err = new Error('subject and message are required');
      err.status = 400;
      throw err;
    }
    const meta =
      vendor.metadata && typeof vendor.metadata === 'object' && !Array.isArray(vendor.metadata)
        ? { ...vendor.metadata }
        : {};
    const outboundMessages = Array.isArray(meta.outboundMessages) ? [...meta.outboundMessages] : [];
    outboundMessages.push({
      subject,
      message,
      sentAt: new Date().toISOString(),
    });
    meta.outboundMessages = outboundMessages;
    vendor.metadata = meta;
    vendor.markModified('metadata');
    await vendor.save();
    await invalidateVendorCaches();

    const toEmail = vendor.contact?.email;
    let emailResult = { sent: false, reason: 'no_contact_email' };
    if (toEmail) {
      try {
        emailResult = await sendVendorNotification({
          to: toEmail,
          subject,
          text: `${message}\n\n— Sent from procurement dashboard`,
        });
      } catch (mailErr) {
        emailResult = { sent: false, reason: mailErr.message || 'send_failed' };
      }
    }

    return {
      vendorId,
      action,
      message: emailResult.sent
        ? `Message emailed to ${toEmail}`
        : 'Message saved on vendor record' + (emailResult.reason ? ` (${emailResult.reason})` : ''),
      emailSent: !!emailResult.sent,
      emailTo: toEmail || null,
    };
  } else {
    const err = new Error('Unknown action');
    err.status = 400;
    throw err;
  }
  await vendor.save();
  await invalidateVendorCaches();
  return {
    vendorId,
    action,
    previousStatus,
    newStatus: vendor.status,
    message: `Action ${action} applied`,
  };
}

async function createJobForVendor(type, meta) {
  const job = new Job({
    ...hubFieldsForCreate(),
    jobId: uuidv4(),
    type,
    status: 'pending',
    result: meta || null,
  });
  await job.save();
  return job.toObject();
}

module.exports = {
  createVendor,
  listVendors,
  getVendorById,
  updateVendor,
  patchVendor,
  performAction,
  createJobForVendor,
  PAYMENT_TERMS,
};
