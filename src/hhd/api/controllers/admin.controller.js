/**
 * Admin: link Picker user to HHD user (same person). Sets picker_users.hhdUserId.
 */
const { ErrorResponse } = require('../../utils/ErrorResponse');
const mongoose = require('mongoose');
const PickerUser = require('../../../picker/models/user.model');

/**
 * PUT /api/admin/picker-users/:pickerUserId/link
 * Body: { hhdUserId: ObjectId } or { hhdUserId: null } to clear.
 */
async function linkPickerUserToHhd(req, res, next) {
  try {
    const { pickerUserId } = req.params;
    let { hhdUserId } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(pickerUserId)) {
      throw new ErrorResponse('Invalid picker user ID', 400);
    }
    if (hhdUserId !== null && hhdUserId !== undefined) {
      hhdUserId = mongoose.Types.ObjectId.isValid(hhdUserId) ? new mongoose.Types.ObjectId(hhdUserId) : null;
    } else {
      hhdUserId = null;
    }
    const pickerUser = await PickerUser.findByIdAndUpdate(
      pickerUserId,
      { $set: { hhdUserId: hhdUserId || null } },
      { new: true }
    );
    if (!pickerUser) throw new ErrorResponse('Picker user not found', 404);
    res.status(200).json({
      success: true,
      data: {
        pickerUserId: pickerUser._id.toString(),
        hhdUserId: pickerUser.hhdUserId ? pickerUser.hhdUserId.toString() : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { linkPickerUserToHhd };
