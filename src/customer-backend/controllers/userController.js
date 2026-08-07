const bcrypt = require('bcryptjs');
const { CustomerUser } = require('../models/CustomerUser');
const cacheService = require('../../core/services/cache.service');
const {
  isPlaceholderCustomerEmail,
  sanitizeCustomerEmail,
} = require('../utils/customerDisplay');

function toPublicProfile(user) {
  if (!user) return user;
  return {
    ...user,
    email: sanitizeCustomerEmail(user.email) || null,
  };
}

function noStore(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
}

async function invalidateCustomerProfileCache() {
  try {
    await cacheService.delPattern('cache:*/user/profile*');
  } catch (err) {
    console.warn('profile cache invalidation failed', err?.message);
  }
}

async function getProfile(req, res) {
  try {
    noStore(res);
    if (!req.user?._id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const user = await CustomerUser.findById(req.user._id).select('-passwordHash').lean();
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.status(200).json({ success: true, data: toPublicProfile(user) });
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updateProfile(req, res) {
  try {
    noStore(res);
    if (!req.user?._id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const allowed = ['name', 'email', 'avatarUrl'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    // Backward-compatible aliases from older/mobile payloads.
    if (req.body.profileImageUrl !== undefined && updates.avatarUrl === undefined) {
      updates.avatarUrl = req.body.profileImageUrl;
    }

    // Auth phone is immutable via profile update. Linking requires OTP verify endpoints.
    const phoneAttempt =
      req.body.phoneNumber !== undefined ||
      req.body.mobileNumber !== undefined ||
      req.body.phone !== undefined;
    if (phoneAttempt) {
      const { isPhoneLocked, normalizePhone } = require('./authController');
      const current = await CustomerUser.findById(req.user._id)
        .select('phoneNumber phoneVerified')
        .lean();
      if (isPhoneLocked(current)) {
        res.status(403).json({
          success: false,
          message: 'Verified phone number cannot be changed. Contact support for account recovery.',
          code: 'PHONE_LOCKED',
        });
        return;
      }
      // Even when unlocked, do not accept raw phone writes — must use OTP link flow.
      const attempted = normalizePhone(
        req.body.phoneNumber ?? req.body.mobileNumber ?? req.body.phone
      );
      const existing = normalizePhone(current?.phoneNumber);
      if (attempted && attempted !== existing) {
        res.status(403).json({
          success: false,
          message: 'Phone number must be verified via OTP before it can be saved',
          code: 'PHONE_OTP_REQUIRED',
        });
        return;
      }
    }

    if (updates.avatarUrl !== undefined) {
      updates.avatarUrl = String(updates.avatarUrl || '').trim();
    }

    if (updates.email !== undefined) {
      const normalizedEmail = String(updates.email || '').trim().toLowerCase();
      if (!normalizedEmail || isPlaceholderCustomerEmail(normalizedEmail)) {
        // Clear placeholder / empty values instead of persisting fakes.
        // Use $unset (not null) so sparse unique email index stays valid.
        updates.email = null;
      } else {
        updates.email = normalizedEmail;
      }
    }

    if (updates.name !== undefined) {
      const normalizedName = String(updates.name || '').trim();
      if (normalizedName.length < 2) {
        res.status(400).json({ success: false, message: 'Full name must be at least 2 characters' });
        return;
      }
      if (normalizedName.length > 100) {
        res.status(400).json({ success: false, message: 'Full name must be 100 characters or fewer' });
        return;
      }
      updates.name = normalizedName;
    }
    if (req.body.savedCheckoutContact !== undefined) {
      const sc = req.body.savedCheckoutContact;
      if (sc !== null && typeof sc === 'object') {
        const existing = await CustomerUser.findById(req.user._id).select('savedCheckoutContact').lean();
        const prev = (existing && existing.savedCheckoutContact) || {};
        const next = { ...prev };
        if (sc.fullName !== undefined) {
          next.fullName = String(sc.fullName || '').trim().slice(0, 200) || undefined;
        }
        if (sc.email !== undefined) {
          next.email = String(sc.email || '').trim().slice(0, 254) || undefined;
        }
        if (sc.phone !== undefined) {
          next.phone = String(sc.phone || '').replace(/\s/g, '').slice(0, 20) || undefined;
        }
        updates.savedCheckoutContact = next;
      }
    }

    const unsetFields = {};
    if (updates.email === null) {
      delete updates.email;
      unsetFields.email = 1;
    }

    const updateOps = {};
    if (Object.keys(updates).length > 0) updateOps.$set = updates;
    if (Object.keys(unsetFields).length > 0) updateOps.$unset = unsetFields;
    if (Object.keys(updateOps).length === 0) {
      const current = await CustomerUser.findById(req.user._id).select('-passwordHash').lean();
      if (!current) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      res.status(200).json({ success: true, data: toPublicProfile(current) });
      return;
    }

    const user = await CustomerUser.findByIdAndUpdate(req.user._id, updateOps, { new: true })
      .select('-passwordHash')
      .lean();
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    await invalidateCustomerProfileCache();
    res.status(200).json({ success: true, data: toPublicProfile(user) });
  } catch (err) {
    console.error('updateProfile error:', err);
    if (err?.code === 11000 && err?.keyPattern?.email) {
      res.status(409).json({ success: false, message: 'That email address is already in use' });
      return;
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function changePassword(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      return;
    }
    const user = await CustomerUser.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    if (user.passwordHash) {
      if (!currentPassword) {
        res.status(400).json({ success: false, message: 'Current password is required' });
        return;
      }
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        res.status(400).json({ success: false, message: 'Current password is incorrect' });
        return;
      }
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    user.autoGeneratedPassword = null;
    user.isPasswordAutoGenerated = false;
    user.passwordLastChangedAt = new Date();
    user.passwordLastChangedBy = 'user';
    await user.save();
    res.status(200).json({ success: true, message: 'Password updated' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function uploadAvatar(req, res) {
  try {
    noStore(res);
    if (!req.user?._id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const image = req.body?.image || req.body?.avatar || req.body?.file;
    if (!image || typeof image !== 'string') {
      res.status(400).json({ success: false, message: 'image (base64) is required' });
      return;
    }
    const { uploadCustomerAvatarImage } = require('../../utils/s3Upload');
    const avatarUrl = await uploadCustomerAvatarImage(String(req.user._id), image);
    const user = await CustomerUser.findByIdAndUpdate(
      req.user._id,
      { $set: { avatarUrl } },
      { new: true }
    )
      .select('-passwordHash')
      .lean();
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    await invalidateCustomerProfileCache();
    res.status(200).json({ success: true, data: toPublicProfile(user) });
  } catch (err) {
    console.error('uploadAvatar error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
}

module.exports = { getProfile, updateProfile, changePassword, uploadAvatar };
