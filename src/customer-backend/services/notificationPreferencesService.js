const { CustomerUser } = require('../models/CustomerUser');
const { PushToken } = require('../models/PushToken');
const logger = require('../../core/utils/logger');
const {
  CATEGORY_LIST,
  CHANNELS,
  DEFAULT_CATEGORY_CHANNELS,
  defaultCategoriesPreferences,
} = require('../constants/notificationCategories');

const DEFAULT_PREFERENCES = {
  push: true,
  inApp: true,
  sms: true,
  whatsapp: true,
  email: true,
  dnd: false,
  dndStartHour: 22,
  dndEndHour: 7,
  categories: defaultCategoriesPreferences(),
};

const ALLOWED_KEYS = [
  'push',
  'inApp',
  'sms',
  'whatsapp',
  'email',
  'dnd',
  'dndStartHour',
  'dndEndHour',
  'categories',
];

function clampHour(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const h = Math.floor(n);
  if (h < 0 || h > 23) return fallback;
  return h;
}

function normalizeCategoryChannels(raw) {
  const base = { ...DEFAULT_CATEGORY_CHANNELS };
  if (!raw || typeof raw !== 'object') return base;
  for (const ch of CHANNELS) {
    if (typeof raw[ch] === 'boolean') base[ch] = raw[ch];
  }
  return base;
}

function normalizeCategories(raw) {
  const defaults = defaultCategoriesPreferences();
  if (!raw || typeof raw !== 'object') return defaults;
  for (const cat of CATEGORY_LIST) {
    if (raw[cat] && typeof raw[cat] === 'object') {
      defaults[cat] = normalizeCategoryChannels(raw[cat]);
    }
  }
  return defaults;
}

function normalizePreferences(raw) {
  const base = {
    push: true,
    inApp: true,
    sms: true,
    whatsapp: true,
    email: true,
    dnd: false,
    dndStartHour: 22,
    dndEndHour: 7,
    categories: defaultCategoriesPreferences(),
  };
  if (!raw || typeof raw !== 'object') return base;
  for (const key of ['push', 'inApp', 'sms', 'whatsapp', 'email', 'dnd']) {
    if (typeof raw[key] === 'boolean') base[key] = raw[key];
  }
  base.dndStartHour = clampHour(raw.dndStartHour, 22);
  base.dndEndHour = clampHour(raw.dndEndHour, 7);
  base.categories = normalizeCategories(raw.categories);
  return base;
}

async function getPreferences(userId) {
  const user = await CustomerUser.findById(userId).select('notificationPreferences').lean();
  return normalizePreferences(user?.notificationPreferences);
}

/**
 * Deactivate every registered push token for the user so no device keeps
 * receiving Expo / Web pushes after Push Notifications is turned off.
 */
async function deactivateAllPushTokens(userId) {
  try {
    const result = await PushToken.updateMany(
      { userId, active: true },
      { $set: { active: false } }
    );
    const modified = result.modifiedCount ?? result.nModified ?? 0;
    if (modified > 0) {
      logger.info('Deactivated push tokens after preference disable', {
        userId: String(userId),
        deactivated: modified,
      });
    }
    return modified;
  } catch (err) {
    logger.warn('Failed to deactivate push tokens', {
      userId: String(userId),
      err: err.message,
    });
    return 0;
  }
}

/** Re-enable previously deactivated tokens when Push is turned back on. */
async function reactivateAllPushTokens(userId) {
  try {
    const result = await PushToken.updateMany(
      { userId, active: false },
      { $set: { active: true } }
    );
    const modified = result.modifiedCount ?? result.nModified ?? 0;
    if (modified > 0) {
      logger.info('Reactivated push tokens after preference enable', {
        userId: String(userId),
        reactivated: modified,
      });
    }
    return modified;
  } catch (err) {
    logger.warn('Failed to reactivate push tokens', {
      userId: String(userId),
      err: err.message,
    });
    return 0;
  }
}

function mergeCategoryPatch(existing, patch) {
  const categories = normalizeCategories(existing);
  if (!patch || typeof patch !== 'object') return categories;
  for (const cat of CATEGORY_LIST) {
    if (patch[cat] && typeof patch[cat] === 'object') {
      categories[cat] = normalizeCategoryChannels({
        ...categories[cat],
        ...patch[cat],
      });
    }
  }
  return categories;
}

async function updatePreferences(userId, patch) {
  const previous = await getPreferences(userId);
  const updates = {};
  for (const key of ['push', 'inApp', 'sms', 'whatsapp', 'email', 'dnd']) {
    if (typeof patch[key] === 'boolean') {
      updates[`notificationPreferences.${key}`] = patch[key];
    }
  }
  if (patch.dndStartHour !== undefined) {
    updates['notificationPreferences.dndStartHour'] = clampHour(patch.dndStartHour, previous.dndStartHour);
  }
  if (patch.dndEndHour !== undefined) {
    updates['notificationPreferences.dndEndHour'] = clampHour(patch.dndEndHour, previous.dndEndHour);
  }
  if (patch.categories && typeof patch.categories === 'object') {
    updates['notificationPreferences.categories'] = mergeCategoryPatch(
      previous.categories,
      patch.categories
    );
  }
  if (Object.keys(updates).length === 0) {
    return { error: 'No valid preference fields provided' };
  }
  const user = await CustomerUser.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true }
  )
    .select('notificationPreferences')
    .lean();
  if (!user) return { error: 'User not found' };

  const preferences = normalizePreferences(user.notificationPreferences);
  if (preferences.push === false) {
    await deactivateAllPushTokens(userId);
  } else if (previous.push === false && preferences.push === true) {
    await reactivateAllPushTokens(userId);
  }

  return { preferences };
}

/** Global push master + DND. */
function isPushEnabled(preferences) {
  const prefs = normalizePreferences(preferences);
  if (prefs.dnd) return false;
  return prefs.push !== false;
}

function isInAppEnabled(preferences) {
  const prefs = normalizePreferences(preferences);
  return prefs.inApp !== false;
}

function isSmsEnabled(preferences) {
  const prefs = normalizePreferences(preferences);
  return prefs.sms !== false;
}

function isWhatsAppEnabled(preferences) {
  const prefs = normalizePreferences(preferences);
  return prefs.whatsapp !== false;
}

function isEmailEnabled(preferences) {
  const prefs = normalizePreferences(preferences);
  return prefs.email !== false;
}

/**
 * Resolve whether a specific channel is allowed for a category.
 * Requires BOTH global channel toggle AND category matrix toggle.
 * Push also requires DND off.
 */
function isChannelAllowedForCategory(preferences, category, channel) {
  const prefs = normalizePreferences(preferences);
  if (!CHANNELS.includes(channel)) return false;

  if (channel === 'push') {
    if (prefs.dnd) return false;
    if (prefs.push === false) return false;
  } else if (prefs[channel] === false) {
    return false;
  }

  const catKey = CATEGORY_LIST.includes(category) ? category : 'system';
  const catPrefs = prefs.categories?.[catKey] || DEFAULT_CATEGORY_CHANNELS;
  return catPrefs[channel] !== false;
}

/**
 * Compute enabled channels for a category given preferences.
 * @param {string[]} [requestedChannels] — if provided, intersect with allowed
 */
function resolveEnabledChannels(preferences, category, requestedChannels) {
  const wanted =
    Array.isArray(requestedChannels) && requestedChannels.length > 0
      ? requestedChannels
      : [...CHANNELS];
  return wanted.filter((ch) => isChannelAllowedForCategory(preferences, category, ch));
}

module.exports = {
  getPreferences,
  updatePreferences,
  normalizePreferences,
  normalizeCategories,
  isPushEnabled,
  isInAppEnabled,
  isSmsEnabled,
  isWhatsAppEnabled,
  isEmailEnabled,
  isChannelAllowedForCategory,
  resolveEnabledChannels,
  deactivateAllPushTokens,
  reactivateAllPushTokens,
  DEFAULT_PREFERENCES,
  ALLOWED_KEYS,
};
