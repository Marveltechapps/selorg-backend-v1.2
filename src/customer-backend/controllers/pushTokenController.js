const { PushToken } = require('../models/PushToken');
const {
  getPreferences,
  deactivateAllPushTokens,
} = require('../services/notificationPreferencesService');

function isExpoToken(token) {
  return typeof token === 'string' && (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[')
  );
}

/**
 * Resolve persisted tokenType: only `expo` | `fcm` (per product requirements).
 * Accepts client `tokenType` / `provider` and falls back to token shape.
 */
function resolveTokenType({ token, tokenType, provider, platform }) {
  if (platform === 'web') return undefined;

  const raw = String(tokenType || provider || '').trim().toLowerCase();
  if (raw === 'expo') return 'expo';
  if (raw === 'fcm' || raw === 'apns') return 'fcm';

  if (isExpoToken(token)) return 'expo';

  // Native device tokens from the customer app (non-Expo).
  if (platform === 'ios' || platform === 'android') return 'fcm';

  return undefined;
}

async function registerToken(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { token, platform, tokenType, provider } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }

    const preferences = await getPreferences(userId);
    if (preferences.push === false) {
      res.status(403).json({
        success: false,
        message: 'Push notifications are disabled. Enable them in settings first.',
      });
      return;
    }

    const allowedPlatforms = new Set(['ios', 'android', 'web']);
    const resolvedPlatform = allowedPlatforms.has(platform) ? platform : 'android';
    const resolvedTokenType = resolveTokenType({
      token,
      tokenType,
      provider,
      platform: resolvedPlatform,
    });

    const update = {
      userId,
      token,
      platform: resolvedPlatform,
      active: true,
    };
    if (resolvedTokenType) {
      update.tokenType = resolvedTokenType;
    }

    await PushToken.findOneAndUpdate(
      { userId, token },
      update,
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Push token registered',
      data: { tokenType: resolvedTokenType || null },
    });
  } catch (err) {
    console.error('registerToken error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
/**
 * Register a Browser Web Push subscription (Chrome/Edge).
 * Body: { subscription: { endpoint, keys: { p256dh, auth }, expirationTime? }, userAgent? }
 */
async function registerWebPush(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const preferences = await getPreferences(userId);
    if (preferences.push === false) {
      res.status(403).json({
        success: false,
        message: 'Push notifications are disabled. Enable them in settings first.',
      });
      return;
    }

    const subscription = req.body?.subscription || req.body;
    const endpoint = subscription?.endpoint;
    const keys = subscription?.keys;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({
        success: false,
        message: 'Valid Web Push subscription (endpoint + keys) is required',
      });
      return;
    }

    await PushToken.findOneAndUpdate(
      { userId, token: endpoint },
      {
        userId,
        token: endpoint,
        platform: 'web',
        active: true,
        webSubscription: {
          endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
        },
        userAgent: req.body?.userAgent || req.headers['user-agent'] || null,
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: 'Web Push subscription registered' });
  } catch (err) {
    console.error('registerWebPush error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function removeToken(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }

    await PushToken.findOneAndUpdate(
      { userId, token },
      { $set: { active: false } }
    );

    res.status(200).json({ success: true, message: 'Push token removed' });
  } catch (err) {
    console.error('removeToken error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

/** Deactivate every push token for the authenticated user (Push OFF). */
async function removeAllTokens(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const deactivated = await deactivateAllPushTokens(userId);

    res.status(200).json({
      success: true,
      message: 'All push tokens removed',
      data: { deactivated },
    });
  } catch (err) {
    console.error('removeAllTokens error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { registerToken, removeToken, removeAllTokens, registerWebPush };
