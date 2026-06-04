/**
 * Device status for Picker app — ties dashboard assignment to HHD app login on the same mobile.
 * "In use" when the linked HHD user has a recent login/heartbeat (lastLogin or picker lastSeenAt).
 */
const mongoose = require('mongoose');
const PickerUser = require('../models/user.model');
const PickerDevice = require('../models/device.model');
const HsdDevice = require('../../darkstore/models/Device');
const { DEVICE_STATUS } = require('../../constants/pickerEnums');
const { HEARTBEAT_OFFLINE_THRESHOLD_MS } = require('../controllers/heartbeat.controller');
const { getLinkedHhdUserForPicker } = require('../helpers/hhdLink.helper');

const HSD_ONLINE_STATUSES = new Set(['online', 'Active']);

function isTimestampRecent(ts, thresholdMs = HEARTBEAT_OFFLINE_THRESHOLD_MS) {
  if (!ts) return false;
  const ms = new Date(ts).getTime();
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms < thresholdMs;
}

/**
 * True when HHD app is logged in / active for the same person (picker heartbeat or HHD lastLogin).
 * Requires linked HHD user account to remain active (isActive !== false).
 */
function isHhdSessionActive(pickerUser, hhdUser) {
  if (hhdUser && hhdUser.isActive === false) return false;
  if (isTimestampRecent(pickerUser?.lastSeenAt)) return true;
  if (hhdUser && isTimestampRecent(hhdUser.lastLogin)) return true;
  return false;
}

/** @deprecated Use isHhdSessionActive — kept for existing imports */
function isHhdActive(pickerUser, hhdUser) {
  return isHhdSessionActive(pickerUser, hhdUser);
}

function isHsdDeviceOnline(hsdDevice) {
  if (!hsdDevice) return false;
  if (isTimestampRecent(hsdDevice.last_seen)) return true;
  if (HSD_ONLINE_STATUSES.has(hsdDevice.status)) {
    return isTimestampRecent(hsdDevice.last_seen, HEARTBEAT_OFFLINE_THRESHOLD_MS * 2);
  }
  return false;
}

/**
 * Mark HSD fleet device online when HHD app sends heartbeat from that device.
 */
async function touchHsdDeviceFromHhdHeartbeat({ deviceId, batteryLevel }) {
  if (!deviceId || !String(deviceId).trim()) return null;
  const now = new Date();
  const update = {
    last_seen: now,
    status: 'online',
    last_sync: now.toISOString(),
  };
  if (typeof batteryLevel === 'number' && !Number.isNaN(batteryLevel)) {
    update.battery_level = Math.min(100, Math.max(0, Math.round(batteryLevel)));
  }
  return HsdDevice.findOneAndUpdate(
    { device_id: String(deviceId).trim() },
    { $set: update },
    { new: true }
  )
    .select('device_id last_seen status battery_level')
    .lean();
}

function buildInactiveDevicePayload(pickerUser, linkedHhdUser, hhdActive) {
  return {
    assigned: false,
    hhdActive,
    hsdDeviceOnline: false,
    inUseOnHhd: false,
    hhdLastSeenAt: pickerUser?.lastSeenAt
      ? new Date(pickerUser.lastSeenAt).toISOString()
      : null,
    hhdLastLoginAt: linkedHhdUser?.lastLogin
      ? new Date(linkedHhdUser.lastLogin).toISOString()
      : null,
  };
}

/**
 * When HHD/HSD session is active but picker_devices row is missing, resolve device from
 * HSD dashboard assignment or the device id on the linked HHD user (heartbeat/login).
 */
async function resolveDeviceForActiveHhdSession(pickerUser, linkedHhdUser) {
  if (!pickerUser) return null;

  const { findHsdAssignmentForPicker } = require('./hsdPickerDeviceSync.service');
  const hsdMatch = await findHsdAssignmentForPicker(pickerUser);
  if (hsdMatch?.device_id) {
    const hsdDevice = await HsdDevice.findOne({ device_id: hsdMatch.device_id })
      .select('device_id serial_number last_seen status battery_level assigned_to')
      .lean();
    return {
      deviceId: hsdMatch.device_id,
      serial: hsdMatch.serial_number || hsdDevice?.serial_number || '',
      assignmentSource: 'hsd_dashboard',
      hsdDevice,
    };
  }

  const hhdDeviceId = linkedHhdUser?.deviceId ? String(linkedHhdUser.deviceId).trim() : null;
  if (!hhdDeviceId) return null;

  const hsdDevice = await HsdDevice.findOne({ device_id: hhdDeviceId })
    .select('device_id serial_number last_seen status battery_level assigned_to')
    .lean();

  return {
    deviceId: hhdDeviceId,
    serial: hsdDevice?.serial_number || '',
    assignmentSource: 'hhd_session',
    hsdDevice,
  };
}

function buildAssignedDevicePayload({
  pickerDevice,
  pickerUser,
  linkedHhdUser,
  hhdActive,
  resolved,
}) {
  const deviceId = pickerDevice?.deviceId || resolved?.deviceId || null;
  const serial = pickerDevice?.serial || resolved?.serial || '';
  const hsdDevice = resolved?.hsdDevice;
  const hsdDeviceOnline = isHsdDeviceOnline(hsdDevice);
  const inUseOnHhd = hhdActive;

  return {
    id: pickerDevice?._id?.toString() || null,
    deviceId,
    serial,
    status: pickerDevice?.status || DEVICE_STATUS.ASSIGNED,
    assignedAt: pickerDevice?.assignedAt
      ? new Date(pickerDevice.assignedAt).toISOString()
      : null,
    assignmentSource:
      resolved?.assignmentSource ||
      (hsdDevice?.assigned_to ? 'hsd_dashboard' : 'picker_devices'),
    assigned: true,
    hhdActive,
    hsdDeviceOnline,
    inUseOnHhd,
    hsdBatteryLevel:
      typeof hsdDevice?.battery_level === 'number' ? hsdDevice.battery_level : null,
    hhdLastSeenAt: pickerUser?.lastSeenAt
      ? new Date(pickerUser.lastSeenAt).toISOString()
      : null,
    hhdLastLoginAt: linkedHhdUser?.lastLogin
      ? new Date(linkedHhdUser.lastLogin).toISOString()
      : null,
    hsdLastSeenAt: hsdDevice?.last_seen
      ? new Date(hsdDevice.last_seen).toISOString()
      : null,
  };
}

/**
 * Resolve assigned picker_devices row + HHD/HSD activity for the logged-in picker.
 * Reconciles HSD dashboard assignment into picker_devices before reading status.
 * When the picker is logged into the HSD/HHD app (active session), exposes assigned=true
 * so the Picker app Profile shows "Device Assigned".
 */
async function buildPickerDeviceStatus(pickerUserId) {
  if (!pickerUserId || !mongoose.Types.ObjectId.isValid(pickerUserId)) {
    return null;
  }

  const { syncFromHsdAssignmentForPicker, findHsdAssignmentForPicker } = require('./hsdPickerDeviceSync.service');

  try {
    await syncFromHsdAssignmentForPicker(pickerUserId);
  } catch (_) {
    /* non-blocking */
  }

  const pickerOid = new mongoose.Types.ObjectId(pickerUserId);
  let pickerUser = await PickerUser.findById(pickerOid)
    .select('lastSeenAt hhdUserId phone name employment.employeeId')
    .lean();

  let pickerDevice = await PickerDevice.findOne({
    assignedPickerId: pickerOid,
    status: DEVICE_STATUS.ASSIGNED,
  }).lean();

  if (!pickerDevice && pickerUser) {
    const hsdMatch = await findHsdAssignmentForPicker(pickerUser);
    if (hsdMatch) {
      try {
        await syncFromHsdAssignmentForPicker(pickerUserId);
        pickerDevice = await PickerDevice.findOne({
          assignedPickerId: pickerOid,
          status: DEVICE_STATUS.ASSIGNED,
        }).lean();
      } catch (_) {
        /* non-blocking */
      }
    }
  }

  const linkedHhdUser = pickerUser ? await getLinkedHhdUserForPicker(pickerUser) : null;
  const hhdActive = isHhdSessionActive(pickerUser, linkedHhdUser);

  if (pickerDevice) {
    const hsdDevice = await HsdDevice.findOne({ device_id: pickerDevice.deviceId })
      .select('device_id last_seen status battery_level assigned_to')
      .lean();
    return buildAssignedDevicePayload({
      pickerDevice,
      pickerUser,
      linkedHhdUser,
      hhdActive,
      resolved: hsdDevice
        ? { hsdDevice, assignmentSource: hsdDevice.assigned_to ? 'hsd_dashboard' : 'picker_devices' }
        : null,
    });
  }

  if (!hhdActive) {
    return buildInactiveDevicePayload(pickerUser, linkedHhdUser, false);
  }

  const resolved = await resolveDeviceForActiveHhdSession(pickerUser, linkedHhdUser);
  if (resolved) {
    return buildAssignedDevicePayload({
      pickerDevice: null,
      pickerUser,
      linkedHhdUser,
      hhdActive: true,
      resolved,
    });
  }

  return {
    ...buildInactiveDevicePayload(pickerUser, linkedHhdUser, true),
    assigned: true,
    status: DEVICE_STATUS.ASSIGNED,
    deviceId: null,
    serial: '',
    inUseOnHhd: true,
    assignmentSource: 'hhd_session',
  };
}

module.exports = {
  HEARTBEAT_OFFLINE_THRESHOLD_MS,
  isHhdSessionActive,
  isHhdActive,
  isHsdDeviceOnline,
  isTimestampRecent,
  touchHsdDeviceFromHhdHeartbeat,
  buildPickerDeviceStatus,
};
