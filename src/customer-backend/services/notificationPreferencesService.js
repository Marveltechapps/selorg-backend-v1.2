const { CustomerUser } = require('../models/CustomerUser');

const DEFAULT_PREFERENCES = {
  push: true,
  sms: true,
  whatsapp: true,
  email: true,
  dnd: false,
};

const ALLOWED_KEYS = Object.keys(DEFAULT_PREFERENCES);

function normalizePreferences(raw) {
  const base = { ...DEFAULT_PREFERENCES };
  if (!raw || typeof raw !== 'object') return base;
  for (const key of ALLOWED_KEYS) {
    if (typeof raw[key] === 'boolean') base[key] = raw[key];
  }
  return base;
}

async function getPreferences(userId) {
  const user = await CustomerUser.findById(userId).select('notificationPreferences').lean();
  return normalizePreferences(user?.notificationPreferences);
}

async function updatePreferences(userId, patch) {
  const updates = {};
  for (const key of ALLOWED_KEYS) {
    if (typeof patch[key] === 'boolean') {
      updates[`notificationPreferences.${key}`] = patch[key];
    }
  }
  if (Object.keys(updates).length === 0) {
    return { error: 'No valid preference fields provided' };
  }
  const user = await CustomerUser.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true },
  )
    .select('notificationPreferences')
    .lean();
  if (!user) return { error: 'User not found' };
  return { preferences: normalizePreferences(user.notificationPreferences) };
}

function isPushEnabled(preferences) {
  const prefs = normalizePreferences(preferences);
  if (prefs.dnd) return false;
  return prefs.push !== false;
}

module.exports = {
  getPreferences,
  updatePreferences,
  normalizePreferences,
  isPushEnabled,
  DEFAULT_PREFERENCES,
  ALLOWED_KEYS,
};
