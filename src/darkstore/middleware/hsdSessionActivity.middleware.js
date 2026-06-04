/**
 * Throttled HSD session keep-alive for authenticated HHD / Picker traffic (Option B).
 * Heartbeat endpoints call touchOrEnsureActiveSession directly (no throttle).
 */
const hsdUserLoginService = require('../services/hsdUserLogin.service');
const { getHhdUserIdForPickerUser } = require('../../picker/helpers/hhdLink.helper');
const PickerUser = require('../../picker/models/user.model');
const HHDUser = require('../../hhd/models/User.model');

const TOUCH_INTERVAL_MS = parseInt(
  process.env.HSD_SESSION_TOUCH_INTERVAL_MS || '30000',
  10
);

const lastTouchAt = new Map();

function shouldThrottle(key) {
  const now = Date.now();
  const last = lastTouchAt.get(key) || 0;
  if (now - last < TOUCH_INTERVAL_MS) return true;
  lastTouchAt.set(key, now);
  return false;
}

async function runHhdSessionTouch(hhdUserId, extras = {}) {
  const user = await HHDUser.findById(hhdUserId).select('mobile name deviceId').lean();
  await hsdUserLoginService.touchOrEnsureActiveSession({
    userId: hhdUserId,
    phoneNumber: user?.mobile || extras.phoneNumber,
    userName: user?.name || extras.userName,
    deviceId: extras.deviceId || user?.deviceId || null,
    storeId: extras.storeId,
    source: extras.source || 'hhd',
  });
}

/**
 * After HHD JWT auth: refresh HSDUserLogin last_activity_at (throttled).
 */
function attachHhdSessionTouch(req, res, next) {
  const hhdUserId = req.user?.id;
  if (hhdUserId && !shouldThrottle(`hhd:${hhdUserId}`)) {
    runHhdSessionTouch(hhdUserId, { source: 'hhd' }).catch(() => {});
  }
  next();
}

/**
 * After Picker JWT auth: refresh via linked HHD user (throttled).
 */
function attachPickerSessionTouch(req, res, next) {
  const pickerUserId = req.userId;
  if (pickerUserId && !shouldThrottle(`picker:${pickerUserId}`)) {
    (async () => {
      const hhdUserId = await getHhdUserIdForPickerUser(pickerUserId);
      if (!hhdUserId) return;
      const picker = await PickerUser.findById(pickerUserId)
        .select('phone name currentLocationId')
        .lean();
      await hsdUserLoginService.touchOrEnsureActiveSession({
        userId: hhdUserId.toString(),
        phoneNumber: picker?.phone,
        userName: picker?.name,
        deviceId: req.body?.deviceId || null,
        storeId: picker?.currentLocationId,
        source: 'picker',
      });
    })().catch(() => {});
  }
  next();
}

module.exports = {
  attachHhdSessionTouch,
  attachPickerSessionTouch,
  TOUCH_INTERVAL_MS,
};
