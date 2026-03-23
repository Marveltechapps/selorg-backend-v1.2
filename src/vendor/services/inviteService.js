const crypto = require('crypto');
const Vendor = require('../models/Vendor');

async function createInviteToken(vendorId, expiryDays) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + (parseInt(expiryDays) || 7) * 24 * 60 * 60 * 1000
  );

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw new Error('Vendor not found');

  if (!vendor.metadata) vendor.metadata = {};
  vendor.metadata.inviteToken = token;
  vendor.metadata.inviteExpiresAt = expiresAt.toISOString();
  vendor.metadata.inviteStatus = 'pending_response';
  vendor.markModified('metadata');
  await vendor.save();

  return { token, expiresAt };
}

async function validateInviteToken(token) {
  // Search all vendors for matching token
  const vendor = await Vendor.findOne({
    'metadata.inviteToken': token,
  }).lean();

  if (!vendor) {
    throw new Error('Invalid invite link');
  }

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

