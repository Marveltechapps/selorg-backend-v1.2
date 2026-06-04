/**
 * Sync Darkstore HSD device assignment (devices collection) → picker_devices (Picker app).
 */
const mongoose = require('mongoose');
const PickerUser = require('../models/user.model');
const PickerDevice = require('../models/device.model');
const HsdDevice = require('../../darkstore/models/Device');
const { DEVICE_STATUS } = require('../../constants/pickerEnums');

let websocketService;
try {
  websocketService = require('../../utils/websocket');
} catch (_) {
  websocketService = null;
}

function normalizePhone10(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

function isPickerUserType(userType) {
  return String(userType || '').trim().toLowerCase() === 'picker';
}

function buildUserIdCandidates(picker) {
  const candidates = new Set();
  if (picker?._id) candidates.add(String(picker._id));
  const phone = normalizePhone10(picker?.phone);
  if (phone) {
    candidates.add(phone);
    candidates.add(`91${phone}`);
    candidates.add(`+91${phone}`);
  }
  if (picker?.hhdUserId) candidates.add(String(picker.hhdUserId));
  const employeeId = picker?.employment?.employeeId;
  if (employeeId && String(employeeId).trim()) candidates.add(String(employeeId).trim());
  if (picker?.name && String(picker.name).trim()) {
    candidates.add(String(picker.name).trim());
  }
  return [...candidates].filter(Boolean);
}

/**
 * Resolve HSD assigned_to.userId to picker_users _id.
 */
async function resolvePickerUserId(userId, userName) {
  const idStr = String(userId || '').trim();
  if (idStr && mongoose.Types.ObjectId.isValid(idStr)) {
    const byId = await PickerUser.findById(idStr).select('_id phone name hhdUserId').lean();
    if (byId) return byId;

    const byHhd = await PickerUser.findOne({ hhdUserId: idStr })
      .select('_id phone name hhdUserId')
      .lean();
    if (byHhd) return byHhd;
  }

  const phone = normalizePhone10(idStr) || normalizePhone10(userName);
  if (phone) {
    const phoneVariants = [
      phone,
      `91${phone}`,
      `+91${phone}`,
      `0${phone}`,
    ];
    const byPhone = await PickerUser.findOne({ phone: { $in: phoneVariants } })
      .select('_id phone name hhdUserId')
      .lean();
    if (byPhone) return byPhone;
    const byPhoneSuffix = await PickerUser.findOne({
      phone: new RegExp(`${phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    })
      .select('_id phone name hhdUserId')
      .lean();
    if (byPhoneSuffix) return byPhoneSuffix;
  }

  if (idStr) {
    const byEmployee = await PickerUser.findOne({ 'employment.employeeId': idStr })
      .select('_id phone name hhdUserId')
      .lean();
    if (byEmployee) return byEmployee;
  }

  if (userName && String(userName).trim()) {
    const byName = await PickerUser.findOne({
      name: new RegExp(`^${String(userName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
      .select('_id phone name hhdUserId')
      .lean();
    if (byName) return byName;
  }

  return null;
}

function pickerIdMatchesAssignment(picker, assignedUserId, assignedUserName) {
  const assigned = String(assignedUserId || '').trim();
  if (!picker) return false;

  if (assigned && String(picker._id) === assigned) return true;

  const phone = normalizePhone10(picker.phone);
  const assignedPhone = normalizePhone10(assigned);
  if (phone && assignedPhone && phone === assignedPhone) return true;

  if (picker.hhdUserId && assigned && String(picker.hhdUserId) === assigned) return true;

  const employeeId = picker.employment?.employeeId;
  if (employeeId && assigned && String(employeeId).trim() === assigned) return true;

  const pickerName = picker.name ? String(picker.name).trim().toLowerCase() : '';
  const assignedName = assignedUserName
    ? String(assignedUserName).trim().toLowerCase()
    : assigned && !mongoose.Types.ObjectId.isValid(assigned)
      ? assigned.toLowerCase()
      : '';
  if (pickerName && assignedName && pickerName === assignedName) return true;

  return false;
}

function isHsdRowAssignedToPicker(picker, hsdRow) {
  if (!hsdRow?.assigned_to?.userId) return false;
  const userType = hsdRow.assigned_to.userType;
  if (userType && String(userType).trim() && !isPickerUserType(userType)) {
    return false;
  }
  return pickerIdMatchesAssignment(
    picker,
    hsdRow.assigned_to.userId,
    hsdRow.assigned_to.userName
  );
}

async function findHsdAssignmentForPicker(picker) {
  const candidates = buildUserIdCandidates(picker);

  if (candidates.length > 0) {
    const match = await HsdDevice.findOne({
      'assigned_to.userId': { $in: candidates },
    })
      .select('device_id assigned_to serial_number store_id')
      .lean();

    if (match && isHsdRowAssignedToPicker(picker, match)) {
      return match;
    }
  }

  const assignments = await HsdDevice.find({
    'assigned_to.userId': { $exists: true, $nin: [null, ''] },
  })
    .select('device_id assigned_to serial_number store_id')
    .lean();

  return assignments.find((d) => isHsdRowAssignedToPicker(picker, d)) || null;
}

/**
 * Persist canonical picker id on the HSD device row (heals legacy phone/name ids).
 */
async function healHsdAssignedTo(deviceId, picker, userType) {
  if (!deviceId || !picker?._id) return;
  const pickerType = userType && isPickerUserType(userType) ? userType : 'Picker';
  await HsdDevice.updateOne(
    { device_id: deviceId },
    {
      $set: {
        'assigned_to.userId': String(picker._id),
        'assigned_to.userName': picker.name || picker.phone || 'Picker',
        'assigned_to.userType': pickerType,
      },
    }
  );
}

function emitDeviceAssignmentEvent(pickerId, event, payload) {
  if (!websocketService) return;
  try {
    if (typeof websocketService.broadcastToUser === 'function') {
      websocketService.broadcastToUser(String(pickerId), event, payload);
    }
    if (typeof websocketService.broadcastToRole === 'function') {
      websocketService.broadcastToRole('picker', event, payload);
    }
    if (typeof websocketService.broadcast === 'function') {
      websocketService.broadcast(event, payload);
    }
  } catch (_) {
    /* non-blocking */
  }
}

/**
 * Canonical picker id + display name for HSD assigned_to (dashboard ↔ picker app).
 */
async function resolveHsdAssignee(userId, userName, userType) {
  if (!isPickerUserType(userType)) {
    return { userId: String(userId || '').trim(), userName: userName || '' };
  }
  const picker = await resolvePickerUserId(userId, userName);
  if (!picker) return null;
  return {
    userId: String(picker._id),
    userName: picker.name || userName || picker.phone || 'Picker',
    picker,
  };
}

/**
 * After HSD dashboard assigns a device to a picker, mirror in picker_devices.
 */
async function syncAssignFromHsd({ deviceId, userId, userName, userType, serialNumber, storeId }) {
  if (!isPickerUserType(userType)) {
    return { synced: false, reason: 'not_picker_user_type' };
  }

  const picker = await resolvePickerUserId(userId, userName);
  if (!picker) {
    const err = new Error('Picker user not found for HSD assignment');
    err.statusCode = 404;
    throw err;
  }

  const pickerId = picker._id;
  const now = new Date();

  await PickerDevice.updateMany(
    {
      assignedPickerId: pickerId,
      status: DEVICE_STATUS.ASSIGNED,
      deviceId: { $ne: deviceId },
    },
    {
      $set: {
        status: DEVICE_STATUS.AVAILABLE,
        assignedPickerId: null,
        returnedAt: now,
        lastReturnedAt: now,
      },
    }
  );

  let pickerDevice = await PickerDevice.findOne({ deviceId });
  if (pickerDevice) {
    if (
      pickerDevice.status === DEVICE_STATUS.ASSIGNED &&
      pickerDevice.assignedPickerId &&
      String(pickerDevice.assignedPickerId) !== String(pickerId)
    ) {
      pickerDevice.assignedPickerId = null;
      pickerDevice.returnedAt = now;
      pickerDevice.lastReturnedAt = now;
      pickerDevice.status = DEVICE_STATUS.AVAILABLE;
      await pickerDevice.save();
      pickerDevice = await PickerDevice.findOne({ deviceId });
    }
    pickerDevice.status = DEVICE_STATUS.ASSIGNED;
    pickerDevice.assignedPickerId = pickerId;
    pickerDevice.assignedAt = now;
    pickerDevice.returnedAt = null;
    if (serialNumber) pickerDevice.serial = serialNumber;
    if (storeId && !pickerDevice.warehouseKey) pickerDevice.warehouseKey = storeId;
    await pickerDevice.save();
  } else {
    pickerDevice = await PickerDevice.create({
      deviceId,
      serial: serialNumber || '',
      status: DEVICE_STATUS.ASSIGNED,
      assignedPickerId: pickerId,
      assignedAt: now,
      warehouseKey: storeId || undefined,
    });
  }

  await PickerUser.findByIdAndUpdate(pickerId, {
    $set: { deviceCollectionCompletedAt: now },
  });

  await healHsdAssignedTo(deviceId, picker, userType);

  emitDeviceAssignmentEvent(pickerId, 'DEVICE_ASSIGNED', {
    pickerId: String(pickerId),
    deviceId: pickerDevice.deviceId,
    serial: pickerDevice.serial || '',
    status: DEVICE_STATUS.ASSIGNED,
    assignedAt: pickerDevice.assignedAt ? pickerDevice.assignedAt.toISOString() : now.toISOString(),
  });

  return {
    synced: true,
    pickerId: String(pickerId),
    pickerDeviceId: String(pickerDevice._id),
    deviceId: pickerDevice.deviceId,
    status: pickerDevice.status,
  };
}

/**
 * After HSD dashboard unassigns, clear picker_devices assignment.
 */
async function syncUnassignFromHsd({ deviceId, userId, userType }) {
  const pickerDevice = await PickerDevice.findOne({ deviceId });
  if (!pickerDevice) {
    return { synced: false, reason: 'no_picker_device' };
  }

  const assignedId = pickerDevice.assignedPickerId
    ? String(pickerDevice.assignedPickerId)
    : null;

  if (userId && isPickerUserType(userType)) {
    const picker = await resolvePickerUserId(userId, null);
    if (picker && assignedId && String(picker._id) !== assignedId) {
      return { synced: false, reason: 'picker_mismatch' };
    }
  }

  const clearedPickerId = assignedId;
  const now = new Date();
  pickerDevice.status = DEVICE_STATUS.AVAILABLE;
  pickerDevice.assignedPickerId = null;
  pickerDevice.returnedAt = now;
  pickerDevice.lastReturnedAt = now;
  await pickerDevice.save();

  if (clearedPickerId) {
    emitDeviceAssignmentEvent(clearedPickerId, 'DEVICE_UNASSIGNED', {
      pickerId: clearedPickerId,
      deviceId,
      status: DEVICE_STATUS.AVAILABLE,
    });
  }

  return { synced: true, deviceId };
}

/**
 * Reconcile picker_devices with HSD devices collection for the logged-in picker.
 * Never clears a local assignment unless HSD confirms the device is not assigned to this picker.
 */
async function syncFromHsdAssignmentForPicker(pickerUserId) {
  const picker = await PickerUser.findById(pickerUserId)
    .select('_id phone name hhdUserId employment.employeeId')
    .lean();
  if (!picker) return { synced: false, reason: 'picker_not_found' };

  const match = await findHsdAssignmentForPicker(picker);

  if (match) {
    return syncAssignFromHsd({
      deviceId: match.device_id,
      userId: match.assigned_to.userId,
      userName: match.assigned_to.userName,
      userType: match.assigned_to.userType,
      serialNumber: match.serial_number,
      storeId: match.store_id,
    });
  }

  const local = await PickerDevice.findOne({
    assignedPickerId: picker._id,
    status: DEVICE_STATUS.ASSIGNED,
  }).lean();

  if (!local) {
    return { synced: false, reason: 'no_hsd_assignment' };
  }

  const hsdDevice = await HsdDevice.findOne({ device_id: local.deviceId })
    .select('device_id assigned_to serial_number store_id')
    .lean();

  const hsdStillAssignedToPicker =
    hsdDevice?.assigned_to &&
    isPickerUserType(hsdDevice.assigned_to.userType) &&
    pickerIdMatchesAssignment(
      picker,
      hsdDevice.assigned_to.userId,
      hsdDevice.assigned_to.userName
    );

  if (hsdStillAssignedToPicker) {
    return syncAssignFromHsd({
      deviceId: hsdDevice.device_id,
      userId: String(picker._id),
      userName: picker.name || hsdDevice.assigned_to.userName,
      userType: hsdDevice.assigned_to.userType,
      serialNumber: hsdDevice.serial_number,
      storeId: hsdDevice.store_id,
    });
  }

  return syncUnassignFromHsd({
    deviceId: local.deviceId,
    userId: String(picker._id),
    userType: 'picker',
  });
}

module.exports = {
  syncAssignFromHsd,
  syncUnassignFromHsd,
  syncFromHsdAssignmentForPicker,
  resolvePickerUserId,
  resolveHsdAssignee,
  isPickerUserType,
  buildUserIdCandidates,
  pickerIdMatchesAssignment,
  findHsdAssignmentForPicker,
};
