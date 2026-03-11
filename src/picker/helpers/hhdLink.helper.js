/**
 * Helper to resolve Picker user → linked HHD user (same person).
 * Used for orders, performance, profile link, etc.
 */
const PickerUser = require('../models/user.model');
const HHDUser = require('../../hhd/models/User.model');

/**
 * Get the linked HHD user ObjectId for a Picker user, or null if not linked.
 * @param {string} pickerUserId - Picker user _id (string or ObjectId)
 * @returns {Promise<ObjectId|null>}
 */
async function getHhdUserIdForPickerUser(pickerUserId) {
  if (!pickerUserId) return null;
  const user = await PickerUser.findById(pickerUserId).select('hhdUserId phone').lean();
  if (!user) return null;

  // If already linked, use the existing HHD user id.
  if (user.hhdUserId) return user.hhdUserId;

  // Auto-link on first use: find HHD user by matching mobile number.
  if (!user.phone) return null;
  const hhdUser = await HHDUser.findOne({ mobile: user.phone }).select('_id').lean();
  if (!hhdUser) return null;

  // Persist the link for future requests (best-effort).
  try {
    await PickerUser.updateOne(
      { _id: pickerUserId },
      { $set: { hhdUserId: hhdUser._id } }
    );
  } catch (_) {
    // Non-blocking – even if update fails, we can still return the resolved id.
  }

  return hhdUser._id;
}

/**
 * Middleware that sets req.hhdUserId from the logged-in Picker user.
 * If not linked, calls next() with no error but req.hhdUserId is null (caller may return 403).
 */
async function attachHhdUserId(req, res, next) {
  try {
    req.hhdUserId = await getHhdUserIdForPickerUser(req.userId);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware that requires the Picker user to be linked to an HHD user.
 * Returns 403 if req.hhdUserId is null (must run after attachHhdUserId).
 */
function requireLinkedHhdUser(req, res, next) {
  if (!req.hhdUserId) {
    return res.status(403).json({
      success: false,
      error: 'Not linked to HHD. Link your Picker account to the HHD device user to access this.',
    });
  }
  next();
}

module.exports = {
  getHhdUserIdForPickerUser,
  attachHhdUserId,
  requireLinkedHhdUser,
};
