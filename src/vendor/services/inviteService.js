async function createInviteToken(vendorId, expiryDays) {
  const crypto = require('crypto');
  const Vendor = require('../models/Vendor');

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + (parseInt(expiryDays) || 7) * 24 * 60 * 60 * 1000
  );

  console.log('Creating invite token for vendorId:', vendorId);
  console.log('Token:', token.slice(0, 10) + '...');

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new Error('Vendor not found: ' + vendorId);
  }

  console.log('Vendor found:', vendor.name);
  console.log('Current metadata type:', typeof vendor.metadata);

  // Handle both Mixed and typed schema metadata
  if (!vendor.metadata) {
    vendor.metadata = {};
  }

  vendor.metadata.inviteToken = token;
  vendor.metadata.inviteExpiresAt = expiresAt.toISOString();
  vendor.metadata.inviteStatus = 'pending_response';
  vendor.metadata.inviteSentAt = new Date().toISOString();

  // Force mongoose to detect the change
  vendor.markModified('metadata');
  vendor.markModified('metadata.inviteToken');
  vendor.markModified('metadata.inviteExpiresAt');
  vendor.markModified('metadata.inviteStatus');

  const saved = await vendor.save();

  // Verify it was actually saved
  console.log(
    'Saved inviteToken:',
    saved.metadata?.inviteToken
      ? 'SAVED (' + saved.metadata.inviteToken.slice(0, 10) + '...)'
      : 'STILL MISSING - PROBLEM'
  );
  console.log('Saved inviteStatus:', saved.metadata?.inviteStatus);

  return { token, expiresAt };
}

async function validateInviteToken(token) {
  const Vendor = require('../models/Vendor');

  console.log('Validating token:', token.slice(0, 10) + '...');

  // Try direct query first
  let vendor = await Vendor.findOne({
    'metadata.inviteToken': token,
  }).lean();

  // If not found, search all vendors (fallback for typed schemas)
  if (!vendor) {
    console.log('Direct query failed, trying full scan...');
    const allVendors = await Vendor.find({
      status: 'invited',
    }).lean();

    vendor = allVendors.find(
      (v) => v.metadata && v.metadata.inviteToken === token
    );
  }

  if (!vendor) {
    console.log('Token not found in any vendor document');
    throw new Error('Invalid invite link');
  }

  console.log('Token found for vendor:', vendor.name);

  if (vendor.metadata.inviteExpiresAt) {
    if (new Date() > new Date(vendor.metadata.inviteExpiresAt)) {
      throw new Error('This invite link has expired');
    }
  }

  if (vendor.metadata.inviteStatus === 'completed') {
    throw new Error('This invite has already been used');
  }

  return {
    vendorId: vendor._id.toString(),
    name: vendor.name,
    email: vendor.contact?.email || '',
    phone: vendor.contact?.phone || '',
    type: vendor.metadata?.vendorType || '',
    category: vendor.metadata?.category || '',
    expiresAt: vendor.metadata.inviteExpiresAt,
    assignedTo: vendor.metadata?.assignedTo || '',
  };
}

async function invalidateToken(vendorId) {
  const Vendor = require('../models/Vendor');
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return;

  if (!vendor.metadata) vendor.metadata = {};
  vendor.metadata.inviteToken = null;
  vendor.metadata.inviteStatus = 'completed';
  vendor.metadata.profileCompletedAt = new Date().toISOString();
  vendor.markModified('metadata');
  await vendor.save();
}

module.exports = {
  createInviteToken,
  validateInviteToken,
  invalidateToken,
};

