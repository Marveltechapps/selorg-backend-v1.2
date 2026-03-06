/**
 * HHD Devices Controller
 * GET /devices/current - Returns deviceId for the logged-in HHD user.
 * Resolves via PickerUser (hhdUserId) -> PickerDevice (assignedPickerId).
 */
const mongoose = require('mongoose');
const PickerUser = require('../../../picker/models/user.model');
const PickerDevice = require('../../../picker/models/device.model');

async function getCurrentDevice(req, res, next) {
  try {
    const hhdUserId = req.user?.id;
    if (!hhdUserId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const pickerUser = await PickerUser.findOne({ hhdUserId: new mongoose.Types.ObjectId(hhdUserId) })
      .select('_id')
      .lean();

    if (!pickerUser) {
      return res.status(200).json({
        success: true,
        data: { deviceId: null, deviceAssigned: false },
      });
    }

    const device = await PickerDevice.findOne({
      assignedPickerId: pickerUser._id,
      status: 'ASSIGNED',
    })
      .select('deviceId serial')
      .lean();

    if (!device) {
      return res.status(200).json({
        success: true,
        data: { deviceId: null, deviceAssigned: false },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        deviceId: device.deviceId,
        serial: device.serial,
        deviceAssigned: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getCurrentDevice };
