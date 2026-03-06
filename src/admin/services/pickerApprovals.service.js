/**
 * Admin Picker Approvals Service
 * List, get, and update picker users for workforce approval workflow.
 */
const PickerUser = require('../../picker/models/user.model');
const PickerDocument = require('../../picker/models/document.model');
const BankAccount = require('../../picker/models/bankAccount.model');
const { PICKER_STATUS } = require('../../constants/pickerEnums');

/**
 * Derive docs status from picker_documents (aadhar front/back, pan front/back)
 */
function getDocsStatus(docCount) {
  // Ideally 4 docs: aadhar front+back, pan front+back
  if (!docCount || docCount === 0) return 'not_uploaded';
  if (docCount >= 4) return 'complete';
  return 'partial';
}

/**
 * Compute training progress % from trainingProgress.video1-4 (0-100 each)
 */
function getTrainingProgressPercent(trainingProgress) {
  if (!trainingProgress) return 0;
  const v = trainingProgress;
  const total = (v.video1 || 0) + (v.video2 || 0) + (v.video3 || 0) + (v.video4 || 0);
  return Math.round(total / 4);
}

/**
 * Derive onboarding stage from profile completeness
 */
function getOnboardingStage(picker, docCount) {
  const hasName = !!picker.name;
  const hasPhone = !!picker.phone;
  const hasDocs = docCount >= 4;
  const hasTraining = picker.trainingCompleted || getTrainingProgressPercent(picker.trainingProgress) >= 100;
  if (hasName && hasPhone && hasDocs && hasTraining) return 'complete';
  if (hasDocs && hasName) return 'training';
  if (hasName || hasPhone) return 'documents';
  return 'profile';
}

/**
 * List pickers with filters and pagination
 */
async function listPickers({ status, page = 1, limit = 20 }) {
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const perPage = Math.min(100, Math.max(1, limit));

  const query = {};
  if (status && status !== 'all') {
    query.status = status;
  }

  const [pickers, total] = await Promise.all([
    PickerUser.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
    PickerUser.countDocuments(query),
  ]);

  const pickerIds = pickers.map((p) => p._id);
  const [docCounts, bankAccounts] = await Promise.all([
    PickerDocument.aggregate([
      { $match: { userId: { $in: pickerIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]),
    BankAccount.find({ userId: { $in: pickerIds } }).select('userId isVerified').lean(),
  ]);
  const docMap = Object.fromEntries(docCounts.map((d) => [d._id.toString(), d.count]));
  const bankMap = Object.fromEntries(
    bankAccounts.map((b) => [b.userId.toString(), { verified: b.isVerified }])
  );

  const items = pickers.map((p) => {
    const id = p._id.toString();
    const docCount = docMap[id] || 0;
    return {
      pickerId: id,
      name: p.name || '—',
      phone: p.phone || '—',
      site: p.currentLocationId || p.locationType || '—',
      docsStatus: getDocsStatus(docCount),
      faceVerification: false, // No stored face verification result in DB; placeholder
      trainingProgress: getTrainingProgressPercent(p.trainingProgress),
      trainingCompleted: p.trainingCompleted || false,
      onboardingStage: getOnboardingStage(p, docCount),
      appliedDate: p.createdAt,
      status: p.status,
      rejectedReason: p.rejectedReason,
      rejectedAt: p.rejectedAt,
      approvedAt: p.approvedAt,
      approvedBy: p.approvedBy,
    };
  });

  return {
    data: items,
    total,
    page: Math.max(1, page),
    pageSize: perPage,
  };
}

/**
 * Get full picker profile by id
 */
async function getPickerById(id) {
  const picker = await PickerUser.findById(id).lean();
  if (!picker) return null;

  const [docs, bankAccounts] = await Promise.all([
    PickerDocument.find({ userId: id }).lean(),
    BankAccount.find({ userId: id }).lean(),
  ]);
  const docCount = docs.length;
  const documents = {
    aadhar: { front: null, back: null },
    pan: { front: null, back: null },
  };
  docs.forEach((d) => {
    if (documents[d.docType]) {
      documents[d.docType][d.side] = d.url;
    }
  });

  const trainingPct = getTrainingProgressPercent(picker.trainingProgress);
  return {
    pickerId: picker._id.toString(),
    name: picker.name,
    phone: picker.phone,
    email: picker.email,
    age: picker.age,
    gender: picker.gender,
    photoUri: picker.photoUri,
    locationType: picker.locationType,
    currentLocationId: picker.currentLocationId,
    selectedShifts: picker.selectedShifts || [],
    trainingProgress: trainingPct,
    trainingProgressObj: picker.trainingProgress || {},
    trainingCompleted: picker.trainingCompleted,
    trainingCompletedAt: picker.trainingCompletedAt,
    status: picker.status,
    rejectedReason: picker.rejectedReason,
    rejectedAt: picker.rejectedAt,
    approvedAt: picker.approvedAt,
    approvedBy: picker.approvedBy,
    upiId: picker.upiId,
    upiName: picker.upiName,
    contractInfo: picker.contractInfo,
    employment: picker.employment,
    createdAt: picker.createdAt,
    updatedAt: picker.updatedAt,
    appliedDate: picker.createdAt,
    documents,
    docsStatus: getDocsStatus(docCount),
    bankDetails: bankAccounts.map((b) => ({
      accountHolder: b.accountHolder,
      accountNumber: b.accountNumber ? `${b.accountNumber.slice(0, 4)}****${b.accountNumber.slice(-4)}` : null,
      ifscCode: b.ifscCode,
      bankName: b.bankName,
      branch: b.branch,
      isVerified: b.isVerified,
      isDefault: b.isDefault,
    })),
    faceVerification: false, // Placeholder
    onboardingStage: getOnboardingStage(picker, docCount),
    hhdUserId: picker.hhdUserId ? picker.hhdUserId.toString() : null,
  };
}

/**
 * Map status to audit action name
 */
function getAuditActionForStatus(status) {
  switch (status) {
    case PICKER_STATUS.ACTIVE:
      return 'picker_approved';
    case PICKER_STATUS.REJECTED:
      return 'picker_rejected';
    case PICKER_STATUS.BLOCKED:
      return 'picker_blocked';
    case PICKER_STATUS.PENDING:
      return 'picker_unblocked';
    default:
      return 'picker_status_updated';
  }
}

/**
 * Update picker status (approve, reject, block, unblock, request re-upload)
 * @param {string} id - Picker user ID
 * @param {object} opts - { status, rejectedReason }
 * @param {string} approvedBy - Admin user ID
 * @param {object} [req] - Express request for audit (optional)
 */
async function updatePickerStatus(id, { status, rejectedReason }, approvedBy, req) {
  const picker = await PickerUser.findById(id);
  if (!picker) return null;

  const now = new Date();

  if (status === PICKER_STATUS.ACTIVE) {
    picker.status = PICKER_STATUS.ACTIVE;
    picker.approvedAt = now;
    picker.approvedBy = approvedBy;
    picker.rejectedReason = undefined;
    picker.rejectedAt = undefined;
  } else if (status === PICKER_STATUS.REJECTED) {
    picker.status = PICKER_STATUS.REJECTED;
    picker.rejectedReason = rejectedReason || 'No reason provided';
    picker.rejectedAt = now;
    picker.approvedAt = undefined;
    picker.approvedBy = undefined;
  } else if (status === PICKER_STATUS.BLOCKED) {
    picker.status = PICKER_STATUS.BLOCKED;
    picker.rejectedReason = rejectedReason || undefined;
    picker.rejectedAt = undefined;
  } else if (status === PICKER_STATUS.PENDING) {
    // Unblock or reset to pending
    picker.status = PICKER_STATUS.PENDING;
    picker.rejectedReason = undefined;
    picker.rejectedAt = undefined;
    picker.approvedAt = undefined;
    picker.approvedBy = undefined;
  } else {
    throw new Error(`Invalid status: ${status}`);
  }

  await picker.save();

  try {
    const { logAdminAction } = require('./adminAudit.service');
    await logAdminAction({
      module: 'admin',
      action: getAuditActionForStatus(status),
      entityType: 'picker',
      entityId: id,
      userId: approvedBy,
      details: { pickerName: picker.name, pickerPhone: picker.phone, rejectedReason: rejectedReason || undefined },
      req,
    });
  } catch (auditErr) {
    console.warn('[pickerApprovals] Admin audit log failed:', auditErr?.message);
  }

  return getPickerById(id);
}

/**
 * Link Picker user to HHD user (same person, shared data).
 * @param {string} pickerId - Picker user ID
 * @param {string} hhdUserId - HHD user ObjectId (from hhd_users collection)
 */
async function linkHhd(pickerId, hhdUserId) {
  const mongoose = require('mongoose');
  const HHDUser = require('../../hhd/models/User.model');

  if (!pickerId || !mongoose.Types.ObjectId.isValid(pickerId)) {
    throw new Error('Invalid picker ID');
  }
  if (!hhdUserId || !mongoose.Types.ObjectId.isValid(hhdUserId)) {
    throw new Error('Invalid HHD user ID');
  }

  const hhdUser = await HHDUser.findById(hhdUserId).lean();
  if (!hhdUser) {
    throw new Error('HHD user not found');
  }

  const picker = await PickerUser.findByIdAndUpdate(
    pickerId,
    { $set: { hhdUserId: new mongoose.Types.ObjectId(hhdUserId) } },
    { new: true }
  ).lean();

  if (!picker) {
    throw new Error('Picker not found');
  }

  return getPickerById(pickerId);
}

/**
 * Unlink Picker user from HHD user.
 */
async function unlinkHhd(pickerId) {
  const mongoose = require('mongoose');

  if (!pickerId || !mongoose.Types.ObjectId.isValid(pickerId)) {
    throw new Error('Invalid picker ID');
  }

  const picker = await PickerUser.findByIdAndUpdate(
    pickerId,
    { $unset: { hhdUserId: 1 } },
    { new: true }
  ).lean();

  if (!picker) {
    throw new Error('Picker not found');
  }

  return getPickerById(pickerId);
}

module.exports = {
  listPickers,
  getPickerById,
  updatePickerStatus,
  linkHhd,
  unlinkHhd,
};
