/**
 * Picker app device return service.
 * Validates device is assigned to the current picker, sets AVAILABLE, condition, returnedAt, lastReturnedAt.
 * Emits DEVICE_RETURNED WebSocket event.
 */
const PickerDevice = require('../models/device.model');
const PickerUser = require('../models/user.model');
const { DEVICE_STATUS } = require('../../constants/pickerEnums');
const { buildPickerDeviceStatus, isHhdSessionActive } = require('./deviceStatus.service');
const { getLinkedHhdUserForPicker } = require('../helpers/hhdLink.helper');
const mongoose = require('mongoose');

let websocketService;
try {
  websocketService = require('../../utils/websocket');
} catch (_) {
  websocketService = null;
}

/**
 * Return a device (picker app). Validates device is assigned to this picker.
 * @param {string} pickerUserId - Current picker's user ID
 * @param {Object} body - { deviceId, condition?, conditionPhotoUrl? }
 */
async function returnDevice(pickerUserId, body) {
  const { deviceId, condition, conditionNotes, conditionPhotoUrl } = body;
  if (!deviceId) throw new Error('deviceId is required');

  const pickerUser = await PickerUser.findById(pickerUserId)
    .select('lastSeenAt phone hhdUserId')
    .lean();
  const linkedHhdUser = pickerUser ? await getLinkedHhdUserForPicker(pickerUser) : null;
  if (isHhdSessionActive(pickerUser, linkedHhdUser)) {
    const err = new Error(
      'HHD app is still logged in on this device. Log out of the HHD app before returning it.'
    );
    err.statusCode = 409;
    throw err;
  }

  const device = await PickerDevice.findOne({ deviceId }).populate('assignedPickerId', 'name phone');
  if (!device) throw new Error('Device not found');
  if (!device.assignedPickerId) throw new Error('Device is not assigned');
  const assignedId = device.assignedPickerId._id
    ? device.assignedPickerId._id.toString()
    : String(device.assignedPickerId);
  const pickerIdStr = mongoose.Types.ObjectId.isValid(pickerUserId)
    ? new mongoose.Types.ObjectId(pickerUserId).toString()
    : String(pickerUserId);
  if (assignedId !== pickerIdStr) {
    throw new Error('Device is not assigned to you');
  }

  device.status = DEVICE_STATUS.AVAILABLE;
  device.assignedPickerId = null;
  device.returnedAt = new Date();
  device.lastReturnedAt = new Date();
  if (condition != null) device.condition = condition;
  if (conditionNotes != null) device.conditionNotes = conditionNotes;
  if (conditionPhotoUrl != null) device.conditionPhotoUrl = conditionPhotoUrl;
  await device.save();

  if (websocketService && typeof websocketService.broadcast === 'function') {
    try {
      websocketService.broadcast('DEVICE_RETURNED', {
        deviceId: device.deviceId,
        id: device._id.toString(),
        returnedAt: device.returnedAt.toISOString(),
      });
    } catch (err) {
      // Non-blocking
    }
  }
  try {
    const { logPickerAction } = require('./pickerActionLog.service');
    await logPickerAction({
      actionType: 'device_return',
      pickerId: String(pickerUserId),
      metadata: { deviceId: device.deviceId, condition: device.condition },
    });
  } catch (_) {}

  return {
    success: true,
    deviceId: device.deviceId,
    status: device.status,
    returnedAt: device.returnedAt.toISOString(),
  };
}

/**
 * Get the device assigned to the current picker.
 * @param {string} pickerUserId - Current picker's user ID
 * @returns {Promise<Object|null>} - Device or null if none assigned
 */
async function getAssignedDevice(pickerUserId) {
  if (!pickerUserId || !mongoose.Types.ObjectId.isValid(pickerUserId)) {
    return null;
  }

  const status = await buildPickerDeviceStatus(pickerUserId);
  if (!status) {
    return { assigned: false, status: null, deviceId: null };
  }
  if (!status.assigned) {
    const { assigned, ...rest } = status;
    return { assigned: false, ...rest };
  }

  const { assigned, ...payload } = status;
  return { assigned: true, ...payload };
}

/**
 * Picker confirms they collected the handheld (after manager OTP).
 * @param {string} pickerUserId
 */
async function acknowledgeDeviceCollection(pickerUserId) {
  const doc = await PickerUser.findById(pickerUserId);
  if (!doc) throw new Error('User not found');
  if (!doc.managerOtpVerifiedAt) {
    const err = new Error('Manager approval is required before confirming device collection');
    err.statusCode = 400;
    throw err;
  }
  doc.deviceCollectionCompletedAt = new Date();
  await doc.save();
  return { success: true };
}

module.exports = { returnDevice, getAssignedDevice, acknowledgeDeviceCollection };
