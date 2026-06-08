const HSDUserLogin = require('../models/HSDUserLogin');
const Device = require('../models/Device');
const PickerUser = require('../../picker/models/user.model');
const HHDUser = require('../../hhd/models/User.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');
const { getHhdUserIdForPickerUser } = require('../../picker/helpers/hhdLink.helper');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

/** Match picker heartbeat offline threshold (see heartbeat.controller.js). */
const HEARTBEAT_OFFLINE_THRESHOLD_MS = 60 * 1000;

const SESSION_INACTIVITY_MS =
  parseInt(process.env.HSD_SESSION_INACTIVITY_HOURS || '12', 10) * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS =
  parseInt(process.env.HSD_SESSION_MAX_AGE_HOURS || '24', 10) * 60 * 60 * 1000;

const DEVICE_INFO_ASSIGNED = 'Assigned';
const DEVICE_INFO_NOT_ASSIGNED = 'Not Assigned';

function deviceInformationForStatus(status) {
  return status === 'active' ? DEVICE_INFO_ASSIGNED : DEVICE_INFO_NOT_ASSIGNED;
}

async function resolveDeviceInfo(deviceId) {
  if (!deviceId) {
    return { device_id: null, device_type: null, device_serial: null };
  }
  try {
    const device = await Device.findOne({ device_id: deviceId }).lean();
    if (device) {
      return {
        device_id: device.device_id,
        device_type: device.device_type || null,
        device_serial: device.serial_number || null,
      };
    }
  } catch (err) {
    logger.warn(`[HSDUserLogin] Device lookup failed for ${deviceId}: ${err.message}`);
  }
  return { device_id: deviceId, device_type: null, device_serial: null };
}

/**
 * Expire stale active sessions (inactivity or max age).
 */
async function expireStaleSessions(storeId) {
  const now = Date.now();
  const inactivityCutoff = new Date(now - SESSION_INACTIVITY_MS);
  const maxAgeCutoff = new Date(now - SESSION_MAX_AGE_MS);

  const query = {
    status: 'active',
    $or: [
      { last_activity_at: { $lt: inactivityCutoff } },
      { login_at: { $lt: maxAgeCutoff } },
    ],
  };
  if (storeId) {
    query.store_id = storeId;
  }

  await HSDUserLogin.updateMany(query, {
    $set: {
      status: 'logged_out',
      logout_at: new Date(),
      logout_reason: 'session_expired',
      device_information: DEVICE_INFO_NOT_ASSIGNED,
    },
  });
}

/**
 * Close other active sessions for the same user (device change / duplicate login).
 */
async function closeActiveSessionsForUser(userId, { exceptSessionId, reason, storeId } = {}) {
  const query = { user_id: String(userId), status: 'active' };
  if (storeId) query.store_id = storeId;
  if (exceptSessionId) query.session_id = { $ne: exceptSessionId };

  await HSDUserLogin.updateMany(query, {
    $set: {
      status: 'logged_out',
      logout_at: new Date(),
      logout_reason: reason || 'duplicate_login',
      device_information: DEVICE_INFO_NOT_ASSIGNED,
    },
  });
}

/**
 * Record a user login on an HSD device.
 */
async function recordLogin({
  phoneNumber,
  userId,
  userName,
  deviceId,
  storeId,
  source = 'hhd',
}) {
  const normalizedPhone = String(phoneNumber || '').replace(/\D/g, '').slice(-10);
  const resolvedStoreId =
    storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';
  const now = new Date();
  const deviceInfo = await resolveDeviceInfo(deviceId);

  await expireStaleSessions(resolvedStoreId);

  const resolvedDeviceId = deviceInfo.device_id || deviceId || null;

  if (resolvedDeviceId) {
    const activeOnSameDevice = await HSDUserLogin.findOne({
      user_id: String(userId),
      device_id: resolvedDeviceId,
      status: 'active',
      store_id: resolvedStoreId,
    });

    if (activeOnSameDevice) {
      activeOnSameDevice.last_activity_at = now;
      activeOnSameDevice.login_at = now;
      activeOnSameDevice.device_information = DEVICE_INFO_ASSIGNED;
      if (userName) activeOnSameDevice.user_name = userName;
      await activeOnSameDevice.save();
      return activeOnSameDevice;
    }
  } else {
    const activeNoDevice = await HSDUserLogin.findOne({
      user_id: String(userId),
      status: 'active',
      store_id: resolvedStoreId,
      $or: [{ device_id: null }, { device_id: '' }],
    }).sort({ login_at: -1 });

    if (activeNoDevice) {
      activeNoDevice.last_activity_at = now;
      activeNoDevice.login_at = now;
      activeNoDevice.device_information = DEVICE_INFO_ASSIGNED;
      if (userName) activeNoDevice.user_name = userName;
      await activeNoDevice.save();
      return activeNoDevice;
    }
  }

  await closeActiveSessionsForUser(userId, {
    reason: deviceId ? 'device_change' : 'duplicate_login',
    storeId: resolvedStoreId,
  });

  const session = await HSDUserLogin.create({
    session_id: generateId('HSD-LOGIN'),
    phone_number: normalizedPhone,
    user_id: String(userId),
    user_name: userName || null,
    device_id: deviceInfo.device_id || deviceId || null,
    device_type: deviceInfo.device_type,
    device_serial: deviceInfo.device_serial,
    store_id: resolvedStoreId,
    login_at: now,
    last_activity_at: now,
    status: 'active',
    device_information: DEVICE_INFO_ASSIGNED,
    source,
  });

  return session;
}

/**
 * Update device on an active session (e.g. after device assignment post-login).
 */
async function updateActiveSessionDevice(userId, deviceId, storeId) {
  const resolvedStoreId =
    storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';
  const deviceInfo = await resolveDeviceInfo(deviceId);

  const active = await HSDUserLogin.findOne({
    user_id: String(userId),
    status: 'active',
    store_id: resolvedStoreId,
  }).sort({ login_at: -1 });

  if (!active) {
    return null;
  }

  if (active.device_id && active.device_id !== deviceInfo.device_id) {
    await closeActiveSessionsForUser(userId, {
      exceptSessionId: active.session_id,
      reason: 'device_change',
      storeId: resolvedStoreId,
    });
    active.status = 'logged_out';
    active.logout_at = new Date();
    active.logout_reason = 'device_change';
    active.device_information = DEVICE_INFO_NOT_ASSIGNED;
    await active.save();
    return recordLogin({
      phoneNumber: active.phone_number,
      userId,
      userName: active.user_name,
      deviceId: deviceInfo.device_id,
      storeId: resolvedStoreId,
      source: active.source,
    });
  }

  active.device_id = deviceInfo.device_id || deviceId;
  active.device_type = deviceInfo.device_type;
  active.device_serial = deviceInfo.device_serial;
  active.last_activity_at = new Date();
  active.device_information = DEVICE_INFO_ASSIGNED;
  await active.save();
  return active;
}

/**
 * Record logout for active session(s).
 */
async function recordLogout({ userId, deviceId, sessionId, reason = 'user_logout' }) {
  const query = { status: 'active' };
  if (sessionId) {
    query.session_id = sessionId;
  } else if (userId) {
    query.user_id = String(userId);
    if (deviceId) query.device_id = deviceId;
  } else {
    return { modifiedCount: 0 };
  }

  const result = await HSDUserLogin.updateMany(query, {
    $set: {
      status: 'logged_out',
      logout_at: new Date(),
      logout_reason: reason,
      device_information: DEVICE_INFO_NOT_ASSIGNED,
    },
  });
  return result;
}

/**
 * Touch last activity for heartbeat.
 */
async function touchSessionActivity(userId) {
  return HSDUserLogin.findOneAndUpdate(
    { user_id: String(userId), status: 'active' },
    { $set: { last_activity_at: new Date() } },
    { sort: { login_at: -1 }, new: true }
  );
}

/**
 * Keep dashboard login status Active: touch existing session or create one if missing.
 */
async function touchOrEnsureActiveSession({
  userId,
  phoneNumber,
  userName = null,
  deviceId = null,
  storeId,
  source = 'hhd',
} = {}) {
  if (!userId) return null;
  const hhdUserId = String(userId);
  const touched = await touchSessionActivity(hhdUserId);
  if (touched) return touched;

  const normalizedPhone = String(phoneNumber || '').replace(/\D/g, '').slice(-10);
  if (!normalizedPhone) return null;

  const resolvedStoreId =
    storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';

  return recordLogin({
    phoneNumber: normalizedPhone,
    userId: hhdUserId,
    userName,
    deviceId,
    storeId: resolvedStoreId,
    source,
  });
}

function formatDeviceInformation(row) {
  if (
    row.device_information === DEVICE_INFO_ASSIGNED ||
    row.device_information === DEVICE_INFO_NOT_ASSIGNED
  ) {
    return row.device_information;
  }
  return deviceInformationForStatus(row.status);
}

function transformLoginRow(row) {
  return {
    sessionId: row.session_id,
    phoneNumber: row.phone_number,
    userName: row.user_name || null,
    userId: row.user_id,
    deviceInformation: formatDeviceInformation(row),
    deviceId: row.device_id,
    deviceType: row.device_type,
    deviceSerial: row.device_serial,
    loginDateTime: row.login_at,
    loginStatus: row.status === 'active' ? 'Active' : 'Logged Out',
    darkStoreLocation: row.store_id,
    lastActivityAt: row.last_activity_at,
    logoutAt: row.logout_at,
    source: row.source,
  };
}

/**
 * When no login rows exist for a store, seed sessions from active pickers / HHD users.
 */
async function backfillSessionsForStore(storeId) {
  const resolvedStoreId =
    storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';

  const existing = await HSDUserLogin.countDocuments({ store_id: resolvedStoreId });
  if (existing > 0) return;

  const now = Date.now();
  const devices = await Device.find({
    store_id: resolvedStoreId,
    'assigned_to.userId': { $exists: true, $ne: null },
  })
    .select('device_id assigned_to')
    .lean();

  const pickers = await PickerUser.find({ status: PICKER_STATUS.ACTIVE })
    .select('name phone hhdUserId lastSeenAt')
    .lean();

  for (const picker of pickers) {
    const pickerId = String(picker._id);
    const hhdUserId = await getHhdUserIdForPickerUser(pickerId);
    if (!hhdUserId) continue;

    const lastSeenMs = picker.lastSeenAt ? new Date(picker.lastSeenAt).getTime() : 0;
    const hhdUser = picker.hhdUserId
      ? await HHDUser.findById(picker.hhdUserId).select('mobile name lastLogin deviceId').lean()
      : await HHDUser.findById(hhdUserId).select('mobile name lastLogin deviceId').lean();
    const lastLoginMs = hhdUser?.lastLogin ? new Date(hhdUser.lastLogin).getTime() : 0;
    const isActive =
      (lastSeenMs && now - lastSeenMs < HEARTBEAT_OFFLINE_THRESHOLD_MS) ||
      (lastLoginMs && now - lastLoginMs < HEARTBEAT_OFFLINE_THRESHOLD_MS);
    if (!isActive) continue;

    const phone = String(picker.phone || hhdUser?.mobile || '')
      .replace(/\D/g, '')
      .slice(-10);
    if (!phone) continue;

    const assignedDevice = devices.find(
      (d) => d.assigned_to?.userId && String(d.assigned_to.userId) === pickerId
    );

    try {
      await touchOrEnsureActiveSession({
        userId: String(hhdUserId),
        phoneNumber: phone,
        userName: picker.name || hhdUser?.name || null,
        deviceId: assignedDevice?.device_id || hhdUser?.deviceId || null,
        storeId: resolvedStoreId,
        source: 'dashboard',
      });
    } catch (err) {
      logger.warn(`[HSDUserLogin] Backfill skipped for picker ${pickerId}: ${err.message}`);
    }
  }

  const recentHhdUsers = await HHDUser.find({
    isActive: true,
    lastLogin: { $gte: new Date(now - HEARTBEAT_OFFLINE_THRESHOLD_MS) },
  })
    .select('mobile name lastLogin deviceId')
    .lean();

  for (const hhd of recentHhdUsers) {
    const phone = String(hhd.mobile || '')
      .replace(/\D/g, '')
      .slice(-10);
    if (!phone) continue;
    const hasSession = await HSDUserLogin.exists({
      store_id: resolvedStoreId,
      user_id: String(hhd._id),
      status: 'active',
    });
    if (hasSession) continue;
    try {
      await touchOrEnsureActiveSession({
        userId: String(hhd._id),
        phoneNumber: phone,
        userName: hhd.name || null,
        deviceId: hhd.deviceId || null,
        storeId: resolvedStoreId,
        source: 'hhd',
      });
    } catch (err) {
      logger.warn(`[HSDUserLogin] Backfill skipped for HHD user ${hhd._id}: ${err.message}`);
    }
  }
}

/**
 * Paginated list for dashboard.
 */
async function getHSDUserList({
  storeId,
  page = 1,
  limit = 20,
  search = '',
  status = 'all',
}) {
  const resolvedStoreId =
    storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';

  await expireStaleSessions(resolvedStoreId);
  await backfillSessionsForStore(resolvedStoreId);

  const legacyFilter = {
    store_id: resolvedStoreId,
    device_information: { $nin: [DEVICE_INFO_ASSIGNED, DEVICE_INFO_NOT_ASSIGNED] },
  };
  await HSDUserLogin.updateMany(
    { ...legacyFilter, status: 'active' },
    { $set: { device_information: DEVICE_INFO_ASSIGNED } }
  );
  await HSDUserLogin.updateMany(
    { ...legacyFilter, status: 'logged_out' },
    { $set: { device_information: DEVICE_INFO_NOT_ASSIGNED } }
  );

  const query = { store_id: resolvedStoreId };
  if (status === 'active') {
    query.status = 'active';
  } else if (status === 'logged_out') {
    query.status = 'logged_out';
  }

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { phone_number: regex },
      { user_name: regex },
      { user_id: regex },
      { device_id: regex },
      { device_information: regex },
      { store_id: regex },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const totalItems = await HSDUserLogin.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  const rows = await HSDUserLogin.find(query)
    .sort({ login_at: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    users: rows.map(transformLoginRow),
    pagination: {
      current_page: page,
      total_pages: totalPages,
      total_items: totalItems,
      items_per_page: limit,
    },
  };
}

module.exports = {
  recordLogin,
  recordLogout,
  updateActiveSessionDevice,
  touchSessionActivity,
  touchOrEnsureActiveSession,
  expireStaleSessions,
  backfillSessionsForStore,
  getHSDUserList,
  transformLoginRow,
};
