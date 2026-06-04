const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDUser = require('../../models/User.model');
const mongoose = require('mongoose');
const PickerUser = require('../../../picker/models/user.model');
const hsdUserLoginService = require('../../../darkstore/services/hsdUserLogin.service');

async function getProfile(req, res, next) {
  try {
    const user = await HHDUser.findById(req.user?.id).select('-password');
    if (!user) throw new ErrorResponse('User not found', 404);

    const linkedPicker = await PickerUser.findOne({ hhdUserId: new mongoose.Types.ObjectId(req.user?.id) })
      .select('name phone photoUri employment')
      .lean();

    const profile = user.toObject();
    if (linkedPicker) {
      profile.linkedPickerProfile = {
        name: linkedPicker.name,
        phone: linkedPicker.phone,
        photoUri: linkedPicker.photoUri,
      };

      if (!profile.name && linkedPicker.name) {
        profile.name = linkedPicker.name;
      }

      if (!profile.mobile && linkedPicker.phone) {
        profile.mobile = linkedPicker.phone;
      }

      if (!profile.department && linkedPicker.employment?.department) {
        profile.department = linkedPicker.employment.department;
      }
    }

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
    const pickerUser = await PickerUser.findOne({ hhdUserId: new mongoose.Types.ObjectId(req.user?.id) })
      .select('name phone photoUri')
      .lean();
    if (!pickerUser) return res.status(200).json({ success: true, data: null });
    res.status(200).json({
      success: true,
      data: {
        name: pickerUser.name,
        phone: pickerUser.phone,
        photoUri: pickerUser.photoUri,
      },
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

    const pickerUser = await PickerUser.findOne({
      hhdUserId: new mongoose.Types.ObjectId(hhdUserId),
    });
    if (!pickerUser) {
      return res.status(200).json({
        success: true,
        data: { lastSeenAt: null, linked: false },
        message: 'No linked picker; heartbeat recorded but will not affect auto-assign',
      });
    }

    const now = new Date();
    pickerUser.lastSeenAt = now;
    await pickerUser.save();

    try {
      const hhdUser = await HHDUser.findById(hhdUserId).select('mobile name deviceId').lean();
      await hsdUserLoginService.touchOrEnsureActiveSession({
        userId: hhdUserId,
        phoneNumber: hhdUser?.mobile,
        userName: hhdUser?.name || null,
        deviceId: hhdUser?.deviceId || null,
        source: 'hhd',
      });
    } catch {
      // Non-blocking heartbeat
    }

    res.status(200).json({
      success: true,
      data: { lastSeenAt: now },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getProfile, updateProfile, getContract, getEmployment, getLinkedPickerProfile, postHeartbeat };
