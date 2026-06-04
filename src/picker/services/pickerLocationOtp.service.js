'use strict';

/**
 * Location-based permanent 6-digit OTP per picker.
 * Derived from picker identity + assigned dark store; changes when location changes.
 */
const crypto = require('crypto');
const PickerUser = require('../models/user.model');
const PickerDarkStoreMembership = require('../models/pickerDarkStoreMembership.model');
const WorkLocation = require('../models/workLocation.model');
const { encryptStoreOtp, decryptStoreOtp, hashStoreOtp, isValidStoreOtp } = require('../utils/storeOtpCrypto');

const NO_LOCATION_SENTINEL = '_pending_location_';

const PEPPER = () =>
  process.env.PICKER_LOCATION_OTP_PEPPER ||
  process.env.PICKER_STORE_OTP_PEPPER ||
  process.env.JWT_SECRET ||
  'picker-location-otp-pepper';

function normalizeLocationId(raw) {
  if (raw == null) return null;
  const id = String(raw).trim();
  return id.length > 0 ? id : null;
}

/**
 * Deterministic 6-digit OTP (100000–999999) for picker + dark store location.
 */
function derivePermanentOtp(pickerId, locationId) {
  const pid = pickerId != null ? String(pickerId).trim() : '';
  const lid = normalizeLocationId(locationId);
  if (!pid || !lid) return null;
  const hmac = crypto.createHmac('sha256', PEPPER()).update(`${pid}:${lid}`).digest();
  const num = hmac.readUInt32BE(0) % 900000;
  return String(100000 + num);
}

function resolveAssignedLocationId(picker) {
  if (!picker) return null;
  return normalizeLocationId(picker.currentLocationId) || normalizeLocationId(picker.storeId);
}

async function resolveAssignedLocationIdAsync(picker) {
  const fromUser = resolveAssignedLocationId(picker);
  if (fromUser) return fromUser;
  const pickerId = picker?._id || picker?.id;
  if (!pickerId) return null;
  const membership = await PickerDarkStoreMembership.findOne({ pickerId })
    .sort({ lastLoginAt: -1 })
    .select('storeId')
    .lean();
  return normalizeLocationId(membership?.storeId);
}

function locationKeyForOtp(pickerId, locationId) {
  return locationId || `${NO_LOCATION_SENTINEL}:${String(pickerId)}`;
}

/**
 * Generate, persist, and return the picker's current 6-digit OTP.
 */
async function ensurePickerLocationOtpStored(pickerOrId) {
  const picker =
    typeof pickerOrId === 'object' && pickerOrId !== null
      ? pickerOrId
      : await PickerUser.findById(pickerOrId).lean();
  if (!picker) return { otp: null, locationId: null, locationName: null };

  const pickerId = picker._id || picker.id;
  const locationId = await resolveAssignedLocationIdAsync(picker);
  const otpKey = locationKeyForOtp(pickerId, locationId);
  const expectedOtp = derivePermanentOtp(pickerId, locationId || otpKey);

  const storedOtp = picker.locationOtp != null ? String(picker.locationOtp).trim() : '';
  const storedKey = picker.locationOtpForLocationId != null ? String(picker.locationOtpForLocationId) : '';
  if (isValidStoreOtp(storedOtp) && storedKey === otpKey && storedOtp === expectedOtp) {
    const meta = locationId ? await resolveLocationMeta(locationId) : null;
    return {
      otp: storedOtp,
      locationId,
      locationName: meta?.locationName || (locationId ? locationId : null),
    };
  }

  await PickerUser.findByIdAndUpdate(pickerId, {
    $set: {
      locationOtp: expectedOtp,
      locationOtpForLocationId: otpKey,
    },
  });

  const meta = locationId ? await resolveLocationMeta(locationId) : null;
  return {
    otp: expectedOtp,
    locationId,
    locationName: meta?.locationName || (locationId ? locationId : null),
  };
}

async function resolveLocationMeta(locationId) {
  const lid = normalizeLocationId(locationId);
  if (!lid) return null;
  const loc = await WorkLocation.findOne({ locationId: lid }).select('locationId name type isActive').lean();
  if (loc && loc.type === 'darkstore') {
    return { locationId: String(loc.locationId), locationName: loc.name || lid, type: 'darkstore' };
  }
  return { locationId: lid, locationName: lid, type: loc?.type || 'darkstore' };
}

/**
 * OTP shown in admin Master Data and used for picker approval verification.
 */
async function getPickerLocationOtp(pickerOrId) {
  return ensurePickerLocationOtpStored(pickerOrId);
}

function buildValidationError(message, code, statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

/**
 * Verify picker identity + assigned location + permanent OTP (approval / device collection).
 */
async function verifyPickerLocationOtp(pickerId, { otp, locationId: locationIdInput } = {}) {
  const otpStr = String(otp ?? '').trim();
  if (!/^\d{6}$/.test(otpStr)) {
    throw buildValidationError('OTP must be exactly 6 digits', 'INVALID_OTP_FORMAT');
  }

  const picker = await PickerUser.findById(pickerId);
  if (!picker) {
    throw buildValidationError('Picker not found', 'PICKER_NOT_FOUND', 404);
  }

  const stored = await ensurePickerLocationOtpStored(picker);
  const assignedLocationId = stored.locationId || (await resolveAssignedLocationIdAsync(picker));

  const submittedLocationId = normalizeLocationId(locationIdInput) || assignedLocationId;
  if (assignedLocationId && submittedLocationId && submittedLocationId !== assignedLocationId) {
    throw buildValidationError(
      'Location does not match your assigned dark store. Select the correct store or contact admin.',
      'LOCATION_MISMATCH'
    );
  }

  const expectedOtp = stored.otp;
  if (!expectedOtp || otpStr !== expectedOtp) {
    throw buildValidationError(
      'Invalid OTP for this location. Use the OTP shown in the Admin Dashboard for your assigned store.',
      'OTP_MISMATCH'
    );
  }

  const meta = assignedLocationId ? await resolveLocationMeta(assignedLocationId) : null;
  if (meta?.type && meta.type !== 'darkstore') {
    throw buildValidationError('Assigned location is not a dark store', 'INVALID_LOCATION_TYPE');
  }

  return {
    success: true,
    pickerId: String(pickerId),
    locationId: assignedLocationId || null,
    locationName: meta?.locationName || stored.locationName || assignedLocationId || null,
  };
}

/**
 * Persist derived OTP on dark-store membership (keeps registry / legacy flows in sync).
 */
function membershipOtpPayload(pickerId, storeId) {
  const otp = derivePermanentOtp(pickerId, storeId);
  if (!otp) return null;
  return {
    otp,
    otpCiphertext: encryptStoreOtp(otp),
    otpHash: hashStoreOtp(storeId, otp),
  };
}

/**
 * Re-sync membership ciphertext when OTP algorithm or location changes.
 */
function syncMembershipOtpFields(membership, pickerId, storeId) {
  const payload = membershipOtpPayload(pickerId, storeId);
  if (!payload) return false;
  const current = decryptStoreOtp(membership.otpCiphertext);
  if (current === payload.otp && isValidStoreOtp(current)) return false;
  membership.otpCiphertext = payload.otpCiphertext;
  membership.otpHash = payload.otpHash;
  return true;
}

/**
 * Resolve OTP for API display (always returns 6 digits when picker id is valid).
 */
async function resolveDisplayOtp(picker) {
  if (!picker) return { otp: null, locationId: null, locationName: null };
  const pickerId = picker._id || picker.id;
  try {
    const stored = await ensurePickerLocationOtpStored(picker);
    if (stored.otp && isValidStoreOtp(stored.otp)) return stored;
  } catch (_) {
    /* fall through to derive */
  }
  const locationId = await resolveAssignedLocationIdAsync(picker);
  const otpKey = locationKeyForOtp(pickerId, locationId);
  const otp = derivePermanentOtp(pickerId, locationId || otpKey);
  if (otp && isValidStoreOtp(otp)) {
    try {
      await PickerUser.findByIdAndUpdate(pickerId, {
        $set: { locationOtp: otp, locationOtpForLocationId: otpKey },
      });
    } catch (_) {
      /* display-only fallback */
    }
  }
  const meta = locationId ? await resolveLocationMeta(locationId) : null;
  return {
    otp,
    locationId,
    locationName: meta?.locationName || (locationId ? locationId : null),
  };
}

module.exports = {
  derivePermanentOtp,
  locationKeyForOtp,
  resolveAssignedLocationId,
  resolveAssignedLocationIdAsync,
  ensurePickerLocationOtpStored,
  resolveDisplayOtp,
  getPickerLocationOtp,
  verifyPickerLocationOtp,
  membershipOtpPayload,
  syncMembershipOtpFields,
};
