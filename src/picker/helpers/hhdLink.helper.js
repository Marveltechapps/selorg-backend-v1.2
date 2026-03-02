/**
 * Helper to resolve Picker user → linked HHD user (same person).
 * Used for orders, performance, profile link, etc.
 */
const PickerUser = require('../models/user.model');

/**
 * Get the linked HHD user ObjectId for a Picker user, or null if not linked.
 * @param {string} pickerUserId - Picker user _id (string or ObjectId)
 * @returns {Promise<ObjectId|null>}
 */
async function getHhdUserIdForPickerUser(pickerUserId) {
  if (!pickerUserId) return null;
  const user = await PickerUser.findById(pickerUserId).select('hhdUserId').lean();
  return user?.hhdUserId || null;
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
