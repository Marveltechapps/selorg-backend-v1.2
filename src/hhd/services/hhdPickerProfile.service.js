/**
 * Resolve PickerUser by HHD login phone and build profile payload for HHD Device Profile screen.
 */
const mongoose = require('mongoose');
const PickerUser = require('../../picker/models/user.model');
const WorkLocation = require('../../picker/models/workLocation.model');
const HHDUser = require('../models/User.model');
const {
  normalizePhone10,
  getPickerUserForHhdUser,
  findPickerByPhone,
  buildPhoneLookupCandidates,
} = require('../../picker/helpers/hhdLink.helper');
const { buildPickerDeviceStatus } = require('../../picker/services/deviceStatus.service');
const { recordHhdPickerPresence } = require('../../picker/helpers/hhdLink.helper');

/**
 * Link HHD user ↔ picker by phone; heal canonical phone on picker when matched by variant.
 */
async function resolveAndLinkPickerForHhdUser(hhdUser) {
  if (!hhdUser?._id) return { picker: null, ambiguous: false };

  let picker = await getPickerUserForHhdUser(hhdUser);
  if (picker) {
    return { picker, ambiguous: false };
  }

  const phone10 = normalizePhone10(hhdUser.mobile);
  if (!phone10) {
    return { picker: null, ambiguous: false };
  }

  const { picker: found, ambiguous } = await findPickerByPhone(phone10);
  if (!found) {
    return { picker: null, ambiguous: false };
  }

  picker = await PickerUser.findById(found._id);
  if (!picker) {
    return { picker: null, ambiguous: false };
  }

  if (picker.phone !== phone10) {
    picker.phone = phone10;
  }
  if (!picker.hhdUserId || picker.hhdUserId.toString() !== hhdUser._id.toString()) {
    picker.hhdUserId = hhdUser._id;
  }
  await picker.save();

  return { picker, ambiguous };
}

async function syncHhdUserFromPicker(hhdUser, picker) {
  if (!hhdUser || !picker) return hhdUser;
  let changed = false;
  if (picker.name && (!hhdUser.name || hhdUser.name.trim() === '')) {
    hhdUser.name = picker.name;
    changed = true;
  }
  if (changed) {
    await hhdUser.save().catch(() => {});
  }
  return hhdUser;
}

function formatDeviceForProfile(deviceStatus) {
  const hhdActive = !!deviceStatus?.hhdActive || !!deviceStatus?.inUseOnHhd;
  const effectivelyAssigned = !!deviceStatus?.assigned || hhdActive;

  if (!effectivelyAssigned) {
    return {
      assigned: false,
      deviceId: null,
      serial: null,
      status: null,
      statusLabel: 'No Assigned Device',
      assignedAt: null,
      hhdActive,
      hsdDeviceOnline: !!deviceStatus?.hsdDeviceOnline,
      inUseOnHhd: hhdActive,
    };
  }
  return {
    assigned: true,
    deviceId: deviceStatus.deviceId || null,
    serial: deviceStatus.serial || null,
    status: deviceStatus.status || 'ASSIGNED',
    statusLabel: hhdActive ? 'Device Assigned' : 'Assigned',
    assignedAt: deviceStatus.assignedAt || null,
    assignmentSource: deviceStatus.assignmentSource || null,
    hhdActive: !!deviceStatus.hhdActive,
    hsdDeviceOnline: !!deviceStatus.hsdDeviceOnline,
    inUseOnHhd: !!deviceStatus.inUseOnHhd,
    hsdBatteryLevel: deviceStatus.hsdBatteryLevel ?? null,
  };
}

/**
 * Full picker profile for HHD Device Profile page.
 */
async function buildHhdPickerProfilePayload(hhdUser, pickerUser = null) {
  const phone10 = normalizePhone10(hhdUser?.mobile);
  let picker = pickerUser;
  let ambiguous = false;
  let linked = false;

  if (picker) {
    linked = true;
  } else if (hhdUser) {
    const resolved = await resolveAndLinkPickerForHhdUser(hhdUser);
    picker = resolved.picker;
    ambiguous = resolved.ambiguous;
    linked = !!picker;
  }

  if (!picker) {
    return {
      linked: false,
      ambiguous: false,
      profileComplete: false,
      message:
        phone10 != null
          ? 'No picker account is registered for this mobile number.'
          : 'Invalid mobile number.',
      picker: null,
      device: formatDeviceForProfile(null),
      loginStatus: {
        isLoggedIn: !!hhdUser?.lastLogin,
        hhdActive: false,
        lastLoginAt: hhdUser?.lastLogin ? new Date(hhdUser.lastLogin).toISOString() : null,
        lastSeenAt: null,
      },
    };
  }

  const pickerId = picker._id || picker.id;
  const [workLoc, deviceStatus] = await Promise.all([
    picker.currentLocationId
      ? WorkLocation.findOne({ locationId: String(picker.currentLocationId) })
          .select('locationId name type address city state')
          .lean()
      : Promise.resolve(null),
    mongoose.Types.ObjectId.isValid(String(pickerId))
      ? buildPickerDeviceStatus(String(pickerId))
      : Promise.resolve(null),
  ]);

  const employment = picker.employment || {};
  const locationName =
    workLoc?.name ||
    (picker.locationType === 'darkstore' ? 'Dark Store' : picker.locationType === 'warehouse' ? 'Warehouse' : null) ||
    picker.currentLocationId ||
    null;

  const hhdActive = !!deviceStatus?.hhdActive;
  const profileComplete = !!(picker.name && picker.phone);

  return {
    linked: true,
    ambiguous,
    profileComplete,
    message: ambiguous
      ? 'Multiple picker records matched this phone; showing the primary active account.'
      : null,
    picker: {
      id: String(pickerId),
      name: picker.name || null,
      phone: picker.phone || phone10 || null,
      email: picker.email || null,
      employeeId: employment.employeeId || null,
      photoUri: picker.photoUri || null,
      status: picker.status || null,
      locationType: picker.locationType || null,
      currentLocationId: picker.currentLocationId || null,
      locationName,
      darkStoreLocation: workLoc
        ? {
            id: workLoc.locationId,
            name: workLoc.name,
            type: workLoc.type,
            address: workLoc.address,
            city: workLoc.city || null,
            state: workLoc.state || null,
          }
        : null,
      role: employment.role || 'Picker',
      department: employment.department || 'Warehouse / Darkstore Operations',
      shiftType: employment.shiftType || null,
      employerName: employment.employerName || null,
      joiningDate: employment.joiningDate
        ? new Date(employment.joiningDate).toISOString()
        : null,
      joinedAt: picker.createdAt ? new Date(picker.createdAt).toISOString() : null,
    },
    device: formatDeviceForProfile(deviceStatus),
    loginStatus: {
      isLoggedIn: true,
      hhdActive,
      lastLoginAt: hhdUser?.lastLogin ? new Date(hhdUser.lastLogin).toISOString() : null,
      lastSeenAt: picker.lastSeenAt ? new Date(picker.lastSeenAt).toISOString() : null,
    },
  };
}

/**
 * Merge HHD user document with picker profile for GET /users/profile.
 * @param {string} hhdUserId
 * @param {{ touchPresence?: boolean }} [options] — refresh linked picker/HHD last-seen when true (sync=1)
 */
async function buildHhdUserProfileResponse(hhdUserId, options = {}) {
  const user = await HHDUser.findById(hhdUserId).select('-password').lean();
  if (!user) return null;

  const hhdDoc = await HHDUser.findById(hhdUserId);
  const { picker } = await resolveAndLinkPickerForHhdUser(hhdDoc);
  if (picker) {
    await syncHhdUserFromPicker(hhdDoc, picker);
    if (options.touchPresence) {
      try {
        await recordHhdPickerPresence(picker, {
          hhdUser: hhdDoc,
          deviceId: hhdDoc?.deviceId,
        });
      } catch (_) {
        /* non-blocking */
      }
    }
  }

  const pickerProfile = await buildHhdPickerProfilePayload(hhdDoc, picker);
  const profile = {
    ...user,
    id: user._id.toString(),
    pickerProfile,
  };

  if (pickerProfile.linked && pickerProfile.picker) {
    const p = pickerProfile.picker;
    if (!profile.name && p.name) profile.name = p.name;
    if (!profile.email && p.email) profile.email = p.email;
    if (!profile.warehouse && p.locationName) profile.warehouse = p.locationName;
    if (!profile.department && p.department) profile.department = p.department;
    if (!profile.role && p.role) profile.role = p.role;
    profile.pickerId = p.id;
    profile.employeeId = p.employeeId;
    profile.photoUri = p.photoUri;
    profile.darkStoreLocation = p.darkStoreLocation;
    profile.assignedDevice = pickerProfile.device;
    profile.loginStatus = pickerProfile.loginStatus;
    profile.pickerStatus = p.status;
  }

  return profile;
}

module.exports = {
  resolveAndLinkPickerForHhdUser,
  syncHhdUserFromPicker,
  buildHhdPickerProfilePayload,
  buildHhdUserProfileResponse,
};
