/**
 * Picker Workforce Device service – device inventory CRUD and actions.
 * Used by warehouse dashboard for device assignment, return, and mark damaged.
 */
const PickerDevice = require('../../picker/models/device.model');
const PickerUser = require('../../picker/models/user.model');
const { DEVICE_STATUS, PICKER_STATUS } = require('../../constants/pickerEnums');
const websocketService = require('../../utils/websocket');
const { mergeWarehouseFilter, warehouseFieldsForCreate } = require('../constants/warehouseScope');

/**
 * List devices with filters
 * @param {Object} filters - { status, search (deviceId/serial) }
 */
async function listDevices(warehouseKey, filters = {}) {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim();
    query.$or = [
      { deviceId: new RegExp(term, 'i') },
      { serial: new RegExp(term, 'i') },
    ];
  }

  const scopedQuery = mergeWarehouseFilter(query, warehouseKey);
  const devices = await PickerDevice.find(scopedQuery)
    .populate('assignedPickerId', 'name phone')
    .sort({ createdAt: -1 })
    .lean();

  return devices.map((d) => ({
    id: d._id.toString(),
    deviceId: d.deviceId,
    serial: d.serial || '',
    status: d.status,
    assignedPicker: d.assignedPickerId
      ? { id: d.assignedPickerId._id.toString(), name: d.assignedPickerId.name || d.assignedPickerId.phone || 'Unknown' }
      : null,
    assignedAt: d.assignedAt ? d.assignedAt.toISOString() : null,
    lastReturnedAt: d.lastReturnedAt ? d.lastReturnedAt.toISOString() : null,
  }));
}

/**
 * Create a new device
 */
async function createDevice(warehouseKey, body) {
  const doc = await PickerDevice.create({
    ...warehouseFieldsForCreate(warehouseKey),
    deviceId: body.deviceId,
    serial: body.serial || undefined,
    status: DEVICE_STATUS.AVAILABLE,
  });
  return toDto(doc);
}

/**
 * PATCH device – actions: assign, return, mark_damaged
 */
async function patchDevice(warehouseKey, id, action, body) {
  const device = await PickerDevice.findOne(mergeWarehouseFilter({ _id: id }, warehouseKey));
  if (!device) return null;

  if (action === 'assign') {
    const { pickerId } = body;
    if (!pickerId) throw new Error('pickerId is required for assign action');
    const picker = await PickerUser.findById(pickerId);
    if (!picker) throw new Error('Picker not found');
    if (picker.status !== PICKER_STATUS.ACTIVE) throw new Error('Picker must be ACTIVE to receive a device');
    if (device.status === DEVICE_STATUS.ASSIGNED) throw new Error('Device is already assigned');
    device.assignedPickerId = pickerId;
    device.assignedAt = new Date();
    device.returnedAt = null;
    device.status = DEVICE_STATUS.ASSIGNED;
  } else if (action === 'return') {
    device.status = DEVICE_STATUS.AVAILABLE;
    device.assignedPickerId = null;
    device.returnedAt = new Date();
    device.lastReturnedAt = new Date();
    if (body.condition != null) device.condition = body.condition;
    if (body.photoUrl != null) device.conditionPhotoUrl = body.photoUrl;
  } else if (action === 'mark_damaged') {
    device.status = DEVICE_STATUS.REPAIR;
    if (body.condition != null) device.condition = body.condition;
  } else {
    throw new Error(`Unknown action: ${action}`);
  }

  await device.save();
  const populated = await PickerDevice.findById(device._id)
    .populate('assignedPickerId', 'name phone')
    .lean();
  return toDto(populated);
}

function toDto(doc) {
  if (!doc) return null;
  const d = (doc.toObject && typeof doc.toObject === 'function') ? doc.toObject() : doc;
  return {
    id: d._id.toString(),
    deviceId: d.deviceId,
    serial: d.serial || '',
    status: d.status,
    assignedPicker: d.assignedPickerId
      ? { id: d.assignedPickerId._id.toString(), name: d.assignedPickerId.name || d.assignedPickerId.phone || 'Unknown' }
      : null,
    assignedAt: d.assignedAt ? (typeof d.assignedAt === 'string' ? d.assignedAt : d.assignedAt.toISOString()) : null,
    lastReturnedAt: d.lastReturnedAt ? (typeof d.lastReturnedAt === 'string' ? d.lastReturnedAt : d.lastReturnedAt.toISOString()) : null,
  };
}

module.exports = {
  listDevices,
  createDevice,
  patchDevice,
};
