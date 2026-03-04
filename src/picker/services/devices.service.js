/**
 * Picker app device return service.
 * Validates device is assigned to the current picker, sets AVAILABLE, condition, returnedAt, lastReturnedAt.
 * Emits DEVICE_RETURNED WebSocket event.
 */
const PickerDevice = require('../models/device.model');
const { DEVICE_STATUS } = require('../../constants/pickerEnums');
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
  const pickerIdStr = mongoose.Types.ObjectId.isValid(pickerUserId)
    ? new mongoose.Types.ObjectId(pickerUserId).toString()
    : String(pickerUserId);
  const device = await PickerDevice.findOne({ assignedPickerId: pickerIdStr })
    .populate('assignedPickerId', 'name phone')
    .lean();
  if (!device) return null;
  return {
    id: device._id.toString(),
    deviceId: device.deviceId,
    serial: device.serial || '',
    status: device.status,
    assignedAt: device.assignedAt ? device.assignedAt.toISOString() : null,
  };
}

module.exports = { returnDevice, getAssignedDevice };
