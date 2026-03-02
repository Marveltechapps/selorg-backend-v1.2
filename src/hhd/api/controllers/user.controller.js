const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDUser = require('../../models/User.model');
const mongoose = require('mongoose');
const PickerUser = require('../../../picker/models/user.model');

async function getProfile(req, res, next) {
  try {
    const user = await HHDUser.findById(req.user?.id).select('-password');
    if (!user) throw new ErrorResponse('User not found', 404);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { name, deviceId } = req.body;
    const user = await HHDUser.findById(req.user?.id);
    if (!user) throw new ErrorResponse('User not found', 404);
    if (name) user.name = name;
    if (deviceId) user.deviceId = deviceId;
    await user.save();
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

module.exports = { getProfile, updateProfile, getContract, getEmployment, getLinkedPickerProfile };
