/**
 * Picker Issue service – create and manage picker-reported issues
 */
const PickerIssue = require('../models/issue.model');
const PickerUser = require('../models/user.model');

/**
 * Create a new issue reported by a picker
 */
async function createIssue(pickerId, payload) {
  const picker = await PickerUser.findById(pickerId).lean();
  if (!picker) throw new Error('Picker not found');

  const storeId = picker.currentLocationId || null;

  const issue = await PickerIssue.create({
    pickerId,
    issueType: payload.issueType,
    orderId: payload.orderId,
    description: payload.description,
    imageUrl: payload.imageUrl,
    severity: payload.severity || null,
    storeId,
  });

  return issue;
}

module.exports = { createIssue };
