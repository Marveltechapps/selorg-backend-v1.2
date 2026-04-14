/**
 * Picker account lifecycle (deletion request, etc.)
 */
const PickerUser = require('../models/user.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');
const { sendPickerTransactionalSms } = require('./sms.service');

const DELETION_MSG =
  'Selorg Picker: Your account deletion request was received. Your account will be removed within 30 days unless you contact support.';

async function requestAccountDeletion(userId, reason) {
  const picker = await PickerUser.findById(userId);
  if (!picker) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (picker.status === PICKER_STATUS.DELETION_PENDING) {
    return {
      alreadyPending: true,
      message:
        'Your account deletion request has been submitted. Your account will be deleted within 30 days.',
    };
  }

  picker.deletionRequestedAt = new Date();
  picker.deletionReason = typeof reason === 'string' ? reason.slice(0, 2000) : '';
  picker.status = PICKER_STATUS.DELETION_PENDING;
  await picker.save();

  try {
    const sms = await sendPickerTransactionalSms(picker.phone, DELETION_MSG);
    if (!sms.sent) {
      console.warn('[account] deletion confirmation SMS not delivered', sms);
    }
  } catch (e) {
    console.warn('[account] deletion SMS error:', e?.message || e);
  }

  return {
    alreadyPending: false,
    message:
      'Your account deletion request has been submitted. Your account will be deleted within 30 days.',
  };
}

module.exports = { requestAccountDeletion };
