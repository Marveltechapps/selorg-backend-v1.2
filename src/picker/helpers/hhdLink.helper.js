/**
 * Helper to resolve Picker user ↔ linked HHD user (same person, same mobile).
 * Used for orders, performance, device status, profile link, etc.
 */
const PickerUser = require('../models/user.model');
const HHDUser = require('../../hhd/models/User.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');

function normalizePhone10(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

function buildPhoneLookupCandidates(phone10) {
  const p = normalizePhone10(phone10);
  if (!p) return [];
  return [...new Set([p, `91${p}`, `+91${p}`, `0${p}`])];
}

/**
 * Find picker by normalized 10-digit phone (handles stored variants).
 * @returns {Promise<{ picker: object|null, ambiguous: boolean }>}
 */
async function findPickerByPhone(phone10) {
  const candidates = buildPhoneLookupCandidates(phone10);
  if (!candidates.length) {
    return { picker: null, ambiguous: false };
  }

  const matches = await PickerUser.find({ phone: { $in: candidates } })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();

  if (!matches.length) {
    return { picker: null, ambiguous: false };
  }
  if (matches.length === 1) {
    return { picker: matches[0], ambiguous: false };
  }

  const active = matches.find((p) => p.status === PICKER_STATUS.ACTIVE);
  const linked = matches.find((p) => p.hhdUserId);
  const picker = active || linked || matches[0];
  return { picker, ambiguous: true };
}

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

  // Auto-link on first use: find HHD user by matching mobile number (phone variants).
  const phone = normalizePhone10(user.phone);
  if (!phone) return null;
  const phoneVariants = buildPhoneLookupCandidates(phone);
  const hhdUser = await HHDUser.findOne({ mobile: { $in: phoneVariants } })
    .select('_id')
    .lean();
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

/**
 * Linked HHD user for a picker (by hhdUserId or matching phone). Auto-links when found by phone.
 * @param {string|Object} pickerUserOrId
 * @returns {Promise<import('mongoose').LeanDocument|null>}
 */
async function getLinkedHhdUserForPicker(pickerUserOrId) {
  let picker =
    pickerUserOrId && typeof pickerUserOrId === 'object' && pickerUserOrId._id
      ? pickerUserOrId
      : null;
  if (!picker && pickerUserOrId) {
    picker = await PickerUser.findById(pickerUserOrId).select('hhdUserId phone').lean();
  }
  if (!picker) return null;

  if (picker.hhdUserId) {
    const linked = await HHDUser.findById(picker.hhdUserId)
      .select('_id mobile lastLogin deviceId isActive')
      .lean();
    if (linked) return linked;
  }

  const phone = normalizePhone10(picker.phone);
  if (!phone) return null;

  const phoneVariants = buildPhoneLookupCandidates(phone);
  const hhdUser = await HHDUser.findOne({ mobile: { $in: phoneVariants } })
    .select('_id mobile lastLogin deviceId isActive')
    .lean();
  if (!hhdUser) return null;

  try {
    await PickerUser.updateOne({ _id: picker._id }, { $set: { hhdUserId: hhdUser._id } });
  } catch (_) {
    /* non-blocking */
  }

  return hhdUser;
}

/**
 * Picker user for an HHD login (by hhdUserId link or same mobile). Auto-links when found by phone.
 * @param {string|Object} hhdUserOrId
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function getPickerUserForHhdUser(hhdUserOrId) {
  let hhdUser =
    hhdUserOrId && typeof hhdUserOrId === 'object' && hhdUserOrId._id ? hhdUserOrId : null;
  if (!hhdUser && hhdUserOrId) {
    hhdUser = await HHDUser.findById(hhdUserOrId).select('mobile _id').lean();
  }
  if (!hhdUser) return null;

  let picker = await PickerUser.findOne({ hhdUserId: hhdUser._id });
  if (picker) return picker;

  const phone = normalizePhone10(hhdUser.mobile);
  if (!phone) return null;

  const { picker: found } = await findPickerByPhone(phone);
  if (!found) return null;

  picker = await PickerUser.findById(found._id);
  if (!picker) return null;

  if (picker.phone !== phone) {
    picker.phone = phone;
  }
  if (!picker.hhdUserId || picker.hhdUserId.toString() !== hhdUser._id.toString()) {
    picker.hhdUserId = hhdUser._id;
  }
  await picker.save();

  return picker;
}

/**
 * Record HHD app session on linked picker (login or heartbeat).
 */
async function recordHhdPickerPresence(pickerUser, options = {}) {
  if (!pickerUser) return null;
  const now = new Date();
  const { deviceId, batteryLevel, hhdUser } = options;

  pickerUser.lastSeenAt = now;
  if (typeof batteryLevel === 'number' && !Number.isNaN(batteryLevel)) {
    pickerUser.batteryLevel = Math.min(100, Math.max(0, Math.round(batteryLevel)));
  }
  await pickerUser.save();

  const hhd =
    hhdUser ||
    (await getLinkedHhdUserForPicker(pickerUser));
  if (hhd?._id) {
    const update = { lastLogin: now };
    if (deviceId) update.deviceId = String(deviceId).trim();
    await HHDUser.updateOne({ _id: hhd._id }, { $set: update });
  }

  notifyPickerHhdSessionActive(pickerUser);

  return now;
}

/** Notify Picker app to refresh device status when HHD session is active. */
function notifyPickerHhdSessionActive(pickerUser) {
  if (!pickerUser?._id) return;
  let websocketService;
  try {
    websocketService = require('../../utils/websocket');
  } catch (_) {
    return;
  }
  if (!websocketService) return;
  const pickerId = String(pickerUser._id);
  const payload = { pickerId, hhdActive: true, inUseOnHhd: true };
  try {
    if (typeof websocketService.broadcastToUser === 'function') {
      websocketService.broadcastToUser(pickerId, 'DEVICE_ASSIGNED', payload);
    }
    if (typeof websocketService.broadcastToRole === 'function') {
      websocketService.broadcastToRole('picker', 'DEVICE_ASSIGNED', payload);
    }
  } catch (_) {
    /* non-blocking */
  }
}

module.exports = {
  normalizePhone10,
  buildPhoneLookupCandidates,
  findPickerByPhone,
  getHhdUserIdForPickerUser,
  getLinkedHhdUserForPicker,
  getPickerUserForHhdUser,
  recordHhdPickerPresence,
  attachHhdUserId,
  requireLinkedHhdUser,
};
