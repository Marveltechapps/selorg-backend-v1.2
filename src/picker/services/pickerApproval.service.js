'use strict';

/**
 * Picker approval request — validates location OTP + identity, unlocks onboarding approval step.
 */
const PickerUser = require('../models/user.model');
const pickerLocationOtpService = require('./pickerLocationOtp.service');

async function verifyApprovalLocationOtp(pickerId, { otp, locationId } = {}) {
  const verification = await pickerLocationOtpService.verifyPickerLocationOtp(pickerId, {
    otp,
    locationId,
  });

  const picker = await PickerUser.findById(pickerId);
  if (!picker) {
    const err = new Error('Picker not found');
    err.statusCode = 404;
    err.code = 'PICKER_NOT_FOUND';
    throw err;
  }

  picker.managerOtpVerifiedAt = new Date();
  picker.locationOtpVerifiedAt = new Date();
  await picker.save();

  return {
    success: true,
    approved: true,
    pickerId: verification.pickerId,
    locationId: verification.locationId,
    locationName: verification.locationName,
  };
}

module.exports = {
  verifyApprovalLocationOtp,
};
