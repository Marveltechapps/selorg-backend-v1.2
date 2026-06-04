/**
 * Shift readiness – validates profile prerequisites before a picker can start a shift.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isDeviceAssigned(device) {
  if (!device) return false;
  const hhdActive = device.inUseOnHhd === true || device.hhdActive === true;
  if (hhdActive) return true;
  if (!device.assigned) return false;
  const status = String(device.status || '').trim().toUpperCase();
  return status === 'ASSIGNED' || !!device.deviceId;
}

function isPersonalInformationComplete(picker, profile) {
  const name = String(picker?.name ?? profile?.name ?? '').trim();
  const email = String(picker?.email ?? profile?.email ?? '').trim();
  const phone = String(picker?.phone ?? profile?.phone ?? '').trim();
  const photoUri = String(picker?.photoUri ?? profile?.photoUri ?? '').trim();
  const age = profile?.age ?? picker?.age;
  const gender = profile?.gender ?? picker?.gender;

  return (
    name.length >= 2 &&
    EMAIL_RE.test(email) &&
    phone.replace(/\D/g, '').length >= 10 &&
    !!photoUri &&
    age != null &&
    Number(age) >= 1 &&
    !!gender
  );
}

function isBankAccountComplete(bank) {
  if (!bank) return false;
  return !!bank.hasAnyAccount || !!bank.upiId;
}

function isTrainingComplete(training) {
  if (!training) return false;
  if (training.trainingCompleted === true) return true;
  return !!training.completed;
}

function isDocumentVerificationComplete(documents) {
  if (!documents) return false;
  const required = documents.requiredCount ?? 0;
  if (required <= 0) return false;
  return documents.approvedCount === required;
}

/**
 * Build readiness flags from profile overview + profile detail.
 * @param {object} overview - getProfileOverview payload
 * @param {object|null} profile - getProfile payload
 */
function evaluateShiftReadiness(overview, profile) {
  const deviceAssigned = isDeviceAssigned(overview?.device);
  const personalInformationComplete = isPersonalInformationComplete(overview?.picker, profile);
  const bankAccountComplete = isBankAccountComplete(overview?.bank);
  const trainingComplete = isTrainingComplete(overview?.training);
  const documentVerificationComplete = isDocumentVerificationComplete(overview?.documents);

  const canStartShift =
    deviceAssigned &&
    personalInformationComplete &&
    bankAccountComplete &&
    trainingComplete &&
    documentVerificationComplete;

  return {
    deviceAssigned,
    personalInformationComplete,
    bankAccountComplete,
    trainingComplete,
    documentVerificationComplete,
    canStartShift,
  };
}

function getBlockingMessage(readiness) {
  if (!readiness || readiness.canStartShift) return '';
  const missing = [];
  if (!readiness.deviceAssigned) missing.push('Device status must be Assigned');
  if (!readiness.personalInformationComplete) missing.push('Complete Personal Information');
  if (!readiness.bankAccountComplete) missing.push('Complete Bank Account details');
  if (!readiness.trainingComplete) missing.push('Complete Training');
  if (!readiness.documentVerificationComplete) missing.push('Complete Document Verification');
  if (missing.length === 0) return 'Complete your profile before starting your shift';
  return `Complete the following before starting your shift: ${missing.join(', ')}`;
}

async function getForUser(userId) {
  const userService = require('./user.service');
  const overview = await userService.getProfileOverview(userId);
  if (!overview) return null;
  const profile = await userService.getProfile(userId);
  return evaluateShiftReadiness(overview, profile);
}

module.exports = {
  evaluateShiftReadiness,
  getForUser,
  getBlockingMessage,
  isDeviceAssigned,
  isPersonalInformationComplete,
  isBankAccountComplete,
  isTrainingComplete,
  isDocumentVerificationComplete,
};
