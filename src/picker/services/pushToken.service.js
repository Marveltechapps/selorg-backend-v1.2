/**
 * PushToken service – from frontend YAML (notificationService.sendTokenToBackend).
 * Register token, userId, platform, deviceId.
 * REAL-TIME: never block – return true even if DB fails (frontend proceeds).
 */
const PushToken = require('../models/pushToken.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const register = async (body) => {
  const { token, userId, platform, deviceId } = body || {};
  if (!token) return false;
  try {
    const filter = userId && deviceId ? { userId, deviceId } : { token };
    await withTimeout(
      PushToken.findOneAndUpdate(
        filter,
        { token, userId, platform, deviceId, updatedAt: new Date() },
        { upsert: true, new: true }
      ),
      DB_TIMEOUT_MS
    );
    return true;
  } catch (err) {
    console.warn('[pushToken] register fallback:', err?.message);
    return true;
  }
};

module.exports = { register };
