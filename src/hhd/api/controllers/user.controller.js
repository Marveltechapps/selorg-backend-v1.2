const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDUser = require('../../models/User.model');
const mongoose = require('mongoose');
const PickerUser = require('../../../picker/models/user.model');
const PickerDevice = require('../../../picker/models/device.model');
const {
  touchHsdDeviceFromHhdHeartbeat,
} = require('../../../picker/services/deviceStatus.service');
const {
  getPickerUserForHhdUser,
  recordHhdPickerPresence,
} = require('../../../picker/helpers/hhdLink.helper');
const { buildHhdUserProfileResponse } = require('../../services/hhdPickerProfile.service');
const hsdUserLoginService = require('../../../darkstore/services/hsdUserLogin.service');

async function getProfile(req, res, next) {
  try {
    const touchPresence =
      req.query?.sync === '1' || req.query?.sync === 'true' || req.query?.sync === true;
    const profile = await buildHhdUserProfileResponse(req.user?.id, { touchPresence });
    if (!profile) throw new ErrorResponse('User not found', 404);
    res.status(200).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { name, email, warehouse, mobile, deviceId } = req.body;
    const user = await HHDUser.findById(req.user?.id);
    if (!user) throw new ErrorResponse('User not found', 404);

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (warehouse !== undefined) user.warehouse = warehouse;
    if (mobile !== undefined) user.mobile = mobile;
    if (deviceId !== undefined) user.deviceId = deviceId;

    await user.save();

    if (deviceId) {
      try {
        await hsdUserLoginService.updateActiveSessionDevice(
          user._id.toString(),
          deviceId,
          req.body?.storeId
        );
      } catch (trackErr) {
        // Non-blocking: profile update still succeeds
      }
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

/** Contract info from linked Picker user (same person). Read-only. */
async function getContract(req, res, next) {
  try {
    const pickerUser = await PickerUser.findOne({ hhdUserId: new mongoose.Types.ObjectId(req.user?.id) })
      .select('contractInfo')
      .lean();
    res.status(200).json({ success: true, data: pickerUser?.contractInfo || {} });
  } catch (error) {
    next(error);
  }
}

/** Employment details from linked Picker user (same person). Read-only. */
async function getEmployment(req, res, next) {
  try {
    const pickerUser = await PickerUser.findOne({ hhdUserId: new mongoose.Types.ObjectId(req.user?.id) })
      .select('employment')
      .lean();
    res.status(200).json({ success: true, data: pickerUser?.employment || {} });
  } catch (error) {
    next(error);
  }
}

/** Linked Picker profile (same person) for HHD device display. */
async function getLinkedPickerProfile(req, res, next) {
  try {
    const profile = await buildHhdUserProfileResponse(req.user?.id);
    if (!profile) throw new ErrorResponse('User not found', 404);
    res.status(200).json({
      success: true,
      data: profile.pickerProfile || { linked: false, picker: null },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * HHD Heartbeat - updates linked PickerUser.lastSeenAt so the picker appears AVAILABLE
 * for auto-assignment when new orders are placed. Call periodically (e.g. every 30s) from
 * OrderReceivedScreen when the picker is ready for orders.
 */
async function postHeartbeat(req, res, next) {
  try {
    const hhdUserId = req.user?.id;
    if (!hhdUserId) throw new ErrorResponse('Unauthorized', 401);

    const { deviceId: bodyDeviceId, batteryLevel } = req.body || {};

    const hhdUser = await HHDUser.findById(hhdUserId);
    const pickerUser = hhdUser ? await getPickerUserForHhdUser(hhdUser) : null;

    if (!pickerUser) {
      if (hhdUser) {
        const now = new Date();
        if (bodyDeviceId) hhdUser.deviceId = String(bodyDeviceId).trim();
        hhdUser.lastLogin = now;
        await hhdUser.save();
      }
      return res.status(200).json({
        success: true,
        data: { lastSeenAt: null, linked: false, hsdDeviceOnline: false },
        message: 'No picker account for this mobile; heartbeat recorded on HHD only',
      });
    }

    const now = await recordHhdPickerPresence(pickerUser, {
      deviceId: bodyDeviceId,
      batteryLevel,
      hhdUser,
    });

    const assignedDevice = await PickerDevice.findOne({
      assignedPickerId: pickerUser._id,
      status: 'ASSIGNED',
    })
      .select('deviceId')
      .lean();

    const resolvedDeviceId =
      (bodyDeviceId && String(bodyDeviceId).trim()) ||
      assignedDevice?.deviceId ||
      hhdUser?.deviceId ||
      null;

    let hsdDevice = null;
    if (resolvedDeviceId) {
      try {
        hsdDevice = await touchHsdDeviceFromHhdHeartbeat({
          deviceId: resolvedDeviceId,
          batteryLevel,
        });
      } catch (_) {
        /* non-blocking */
      }
    }

    try {
      await hsdUserLoginService.touchOrEnsureActiveSession({
        userId: hhdUserId,
        phoneNumber: hhdUser?.mobile,
        userName: hhdUser?.name || null,
        deviceId: resolvedDeviceId || hhdUser?.deviceId || null,
        source: 'hhd',
      });
    } catch {
      // Non-blocking heartbeat
    }

    res.status(200).json({
      success: true,
      data: {
        lastSeenAt: now,
        linked: true,
        deviceId: resolvedDeviceId,
        hsdDeviceOnline: !!hsdDevice,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getProfile, updateProfile, getContract, getEmployment, getLinkedPickerProfile, postHeartbeat };
