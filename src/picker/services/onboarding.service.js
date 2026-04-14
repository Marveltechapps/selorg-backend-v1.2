/**
 * Onboarding Service
 * Derives onboarding state from picker_users, picker_documents, picker_devices.
 */
const mongoose = require('mongoose');
const PickerUser = require('../models/user.model');
const PickerDocument = require('../models/document.model');
const PickerDevice = require('../models/device.model');

const STEPS = [
  'profile',
  'documents',
  'verification',
  'training',
  'location',
  'shifts',
  'setup',
  'collect_device',
  'home',
];

/**
 * Get onboarding state for a picker user.
 * @param {string} userId - Picker user ID
 * @returns {Promise<object>} { currentStep, hasCompletedProfile, hasCompletedDocuments, ... status }
 */
async function getOnboardingState(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return {
      currentStep: 'profile',
      hasCompletedProfile: false,
      hasCompletedDocuments: false,
      hasCompletedVerification: false,
      hasCompletedTraining: false,
      hasCompletedSetup: false,
      hasCompletedManagerOTP: false,
      hasCompletedDeviceCollection: false,
      status: null,
    };
  }

  const [picker, docCount, deviceAssigned] = await Promise.all([
    PickerUser.findById(userId).lean(),
    PickerDocument.countDocuments({ userId }),
    PickerDevice.findOne({ assignedPickerId: userId, status: 'ASSIGNED' }).lean(),
  ]);

  if (!picker) {
    return {
      currentStep: 'profile',
      hasCompletedProfile: false,
      hasCompletedDocuments: false,
      hasCompletedVerification: false,
      hasCompletedTraining: false,
      hasCompletedSetup: false,
      hasCompletedManagerOTP: false,
      hasCompletedDeviceCollection: false,
      status: null,
    };
  }

  const hasCompletedProfile = !!(picker.name && picker.age && picker.gender);
  const hasCompletedDocuments = docCount >= 4;
  const hasCompletedVerification =
    picker.status === 'ACTIVE' || picker.status === 'REJECTED' || picker.status === 'BLOCKED' || picker.status === 'SUSPENDED';
  const hasCompletedTraining = !!picker.trainingCompleted;
  const hasCompletedSetup = Array.isArray(picker.selectedShifts) && picker.selectedShifts.length > 0;
  const managerOtpApproved = !!picker.managerOtpVerifiedAt;
  const deviceCollectionDone = !!picker.deviceCollectionCompletedAt || !!deviceAssigned;
  /** Manager approval step (OTP verified); app also needs deviceCollectionDone to finish onboarding. */
  const hasCompletedManagerOTP = managerOtpApproved;

  let currentStep = 'profile';
  if (!hasCompletedProfile) currentStep = 'profile';
  else if (!hasCompletedDocuments) currentStep = 'documents';
  else if (!hasCompletedVerification) currentStep = 'verification';
  else if (picker.status === 'REJECTED' || picker.status === 'BLOCKED' || picker.status === 'SUSPENDED')
    currentStep = 'verification'; // Redirect handled by status screens
  else if (!hasCompletedTraining) currentStep = 'training';
  else if (!picker.locationType || !picker.currentLocationId) currentStep = 'location';
  else if (!hasCompletedSetup) currentStep = 'shifts';
  else if (!managerOtpApproved || !deviceCollectionDone) currentStep = 'collect_device';
  else currentStep = 'home';

  return {
    currentStep,
    hasCompletedProfile,
    hasCompletedDocuments,
    hasCompletedVerification,
    hasCompletedTraining,
    hasCompletedSetup,
    hasCompletedManagerOTP,
    hasCompletedDeviceCollection: deviceCollectionDone,
    status: picker.status,
  };
}

module.exports = { getOnboardingState };
