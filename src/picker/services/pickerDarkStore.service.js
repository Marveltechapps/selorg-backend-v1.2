/**
 * Picker ↔ dark store registration: permanent 6-digit location-based OTP per picker, auto registry on login.
 */
const mongoose = require('mongoose');
const PickerUser = require('../models/user.model');
const PickerDarkStoreMembership = require('../models/pickerDarkStoreMembership.model');
const Store = require('../../merch/models/Store');
const locationService = require('./location.service');
const { decryptStoreOtp } = require('../utils/storeOtpCrypto');
const pickerLocationOtpService = require('./pickerLocationOtp.service');
const websocketService = require('../../utils/websocket');

function normalizeStoreId(raw) {
  if (raw == null) return null;
  const id = String(raw).trim();
  return id.length > 0 ? id : null;
}

async function resolveDarkStoreMeta(storeId) {
  const normalized = normalizeStoreId(storeId);
  if (!normalized) {
    const err = new Error('Dark store id is required');
    err.statusCode = 400;
    throw err;
  }

  let location;
  try {
    location = await locationService.getLocationById(normalized);
  } catch (_) {
    location = null;
  }

  if (!location || location.type !== 'darkstore') {
    const err = new Error('Invalid dark store. Location must be an active dark store.');
    err.statusCode = 400;
    throw err;
  }

  const canonicalStoreId = String(location.locationId || normalized);
  return {
    storeId: canonicalStoreId,
    storeName: location.name || canonicalStoreId,
    locationType: 'darkstore',
  };
}

function resolvePickerStoreOtp(pickerId, storeId) {
  const payload = pickerLocationOtpService.membershipOtpPayload(pickerId, storeId);
  if (!payload) {
    const err = new Error('Unable to derive store OTP for this picker and location');
    err.statusCode = 500;
    throw err;
  }
  return payload;
}

async function syncPickerUserStore(pickerId, storeId, storeName, locationType) {
  const update = {
    currentLocationId: storeId,
    locationType: locationType || 'darkstore',
  };
  if (mongoose.Types.ObjectId.isValid(storeId)) {
    update.storeId = new mongoose.Types.ObjectId(storeId);
  }
  await PickerUser.findByIdAndUpdate(pickerId, update, { runValidators: true });
}

function membershipToResponse(membership, plainOtp, isFirstLogin) {
  return {
    storeId: membership.storeId,
    storeName: membership.storeName || membership.storeId,
    permanentOtp: plainOtp,
    isFirstLogin,
    firstLoginAt: membership.firstLoginAt,
    lastLoginAt: membership.lastLoginAt,
    loginCount: membership.loginCount,
  };
}

/**
 * Register or refresh picker at a dark store. Creates permanent OTP on first visit only.
 */
async function registerPickerAtDarkStore(pickerId, storeIdInput) {
  if (!pickerId) {
    const err = new Error('Picker id is required');
    err.statusCode = 400;
    throw err;
  }

  const picker = await PickerUser.findById(pickerId);
  if (!picker) {
    const err = new Error('Picker not found');
    err.statusCode = 404;
    throw err;
  }

  const { storeId, storeName, locationType } = await resolveDarkStoreMeta(storeIdInput);
  const now = new Date();

  let existing = await PickerDarkStoreMembership.findOne({ pickerId, storeId });
  if (existing) {
    pickerLocationOtpService.syncMembershipOtpFields(existing, pickerId, storeId);
    const plainOtp = decryptStoreOtp(existing.otpCiphertext);
    if (!plainOtp) {
      const err = new Error('Stored OTP could not be retrieved. Contact support.');
      err.statusCode = 500;
      throw err;
    }
    existing.lastLoginAt = now;
    existing.loginCount = (existing.loginCount || 1) + 1;
    if (storeName && !existing.storeName) existing.storeName = storeName;
    await existing.save();

    await syncPickerUserStore(pickerId, storeId, storeName, locationType);
    const storedOtpExisting = await pickerLocationOtpService.ensurePickerLocationOtpStored(pickerId);
    if (storedOtpExisting?.otp) plainOtp = storedOtpExisting.otp;
    websocketService.broadcastToRole('darkstore', 'picker:updated', {
      pickerId: String(pickerId),
      storeId,
      action: 'store_login',
    });

    return membershipToResponse(existing, plainOtp, false);
  }

  let created;
  let plainOtp;
  const otpPayload = resolvePickerStoreOtp(pickerId, storeId);
  plainOtp = otpPayload.otp;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      created = await PickerDarkStoreMembership.create({
        pickerId,
        storeId,
        storeName,
        otpCiphertext: otpPayload.otpCiphertext,
        otpHash: otpPayload.otpHash,
        firstLoginAt: now,
        lastLoginAt: now,
        loginCount: 1,
      });
      break;
    } catch (e) {
      if (e?.code === 11000) {
        const raceWinner = await PickerDarkStoreMembership.findOne({ pickerId, storeId });
        if (raceWinner) {
          existing = raceWinner;
          break;
        }
        continue;
      }
      throw e;
    }
  }

  if (existing) {
    let otp = decryptStoreOtp(existing.otpCiphertext);
    existing.lastLoginAt = now;
    existing.loginCount = (existing.loginCount || 1) + 1;
    await existing.save();
    await syncPickerUserStore(pickerId, storeId, storeName, locationType);
    const storedOtpRace = await pickerLocationOtpService.ensurePickerLocationOtpStored(pickerId);
    if (storedOtpRace?.otp) otp = storedOtpRace.otp;
    websocketService.broadcastToRole('darkstore', 'picker:updated', {
      pickerId: String(pickerId),
      storeId,
      action: 'store_login',
    });
    return membershipToResponse(existing, otp, false);
  }

  if (!created || !plainOtp) {
    const err = new Error('Failed to register picker at dark store');
    err.statusCode = 500;
    throw err;
  }

  await syncPickerUserStore(pickerId, storeId, storeName, locationType);
  const storedOtp = await pickerLocationOtpService.ensurePickerLocationOtpStored(pickerId);
  if (storedOtp?.otp) {
    plainOtp = storedOtp.otp;
  }
  websocketService.broadcastToRole('darkstore', 'picker:updated', {
    pickerId: String(pickerId),
    storeId,
    action: 'store_login',
  });

  return membershipToResponse(created, plainOtp, true);
}

/**
 * List all pickers registered at a dark store (for dashboard picker list).
 */
async function listRegisteredPickersForStore(storeIdInput) {
  const { storeId, storeName } = await resolveDarkStoreMeta(storeIdInput);

  const memberships = await PickerDarkStoreMembership.find({ storeId })
    .sort({ lastLoginAt: -1 })
    .lean();

  if (!memberships.length) {
    return { storeId, storeName, pickers: [] };
  }

  const pickerIds = memberships.map((m) => m.pickerId);
  const pickers = await PickerUser.find({ _id: { $in: pickerIds } })
    .select('name phone lastSeenAt batteryLevel activeOrderId onBreak status currentLocationId')
    .lean();
  const pickerMap = new Map(pickers.map((p) => [String(p._id), p]));

  const pickersOut = memberships.map((m) => {
    let plainOtp = decryptStoreOtp(m.otpCiphertext);
    if (!plainOtp) {
      plainOtp = pickerLocationOtpService.derivePermanentOtp(m.pickerId, storeId);
    }
    const picker = pickerMap.get(String(m.pickerId));
    return {
      id: String(m.pickerId),
      name: picker?.name || picker?.phone || 'Unknown',
      phone: picker?.phone || null,
      permanentOtp: plainOtp,
      firstLoginAt: m.firstLoginAt,
      lastLoginAt: m.lastLoginAt,
      loginCount: m.loginCount,
      status: picker?.status || null,
      lastSeenAt: picker?.lastSeenAt || null,
      batteryLevel: picker?.batteryLevel ?? null,
      activeOrderId: picker?.activeOrderId || null,
      onBreak: picker?.onBreak ?? false,
    };
  });

  return { storeId, storeName, pickers: pickersOut };
}

/**
 * Get permanent OTP for picker at store (picker app).
 */
async function getPermanentOtpForPicker(pickerId, storeIdInput) {
  const { storeId, storeName } = await resolveDarkStoreMeta(storeIdInput);
  const stored = await pickerLocationOtpService.ensurePickerLocationOtpStored(pickerId);
  const membership = await PickerDarkStoreMembership.findOne({ pickerId, storeId }).lean();
  const plainOtp = stored.otp;
  if (!plainOtp) {
    const err = new Error('OTP could not be generated for this picker');
    err.statusCode = 500;
    throw err;
  }
  if (!membership) {
    const err = new Error('Picker is not registered at this dark store. Complete store login first.');
    err.statusCode = 404;
    throw err;
  }
  return {
    storeId: membership.storeId || storeId,
    storeName: membership.storeName || storeName,
    permanentOtp: plainOtp,
    firstLoginAt: membership.firstLoginAt,
    lastLoginAt: membership.lastLoginAt,
  };
}

module.exports = {
  normalizeStoreId,
  resolveDarkStoreMeta,
  registerPickerAtDarkStore,
  listRegisteredPickersForStore,
  getPermanentOtpForPicker,
};
