/**
 * Admin Picker Approvals Controller
 * Workforce approval workflow for picker users.
 */
const pickerApprovalsService = require('../services/pickerApprovals.service');
const { getLogsByPicker, getAllLogs } = require('../../picker/services/pickerActionLog.service');
const PickerUser = require('../../picker/models/user.model');
const PickerDocument = require('../../picker/models/document.model');
const BankAccount = require('../../picker/models/bankAccount.model');
const TrainingVideo = require('../../picker/models/trainingVideo.model');
const WatchHistory = require('../../picker/models/watchHistory.model');
const { logAdminAction } = require('../services/adminAudit.service');
const logger = require('../../core/utils/logger');

/**
 * GET /admin/pickers - List pickers with filters
 */
async function listPickers(req, res, next) {
  try {
    const { status, page, limit, locationId, search } = req.query;
    const result = await pickerApprovalsService.listPickers({
      status: status || 'all',
      locationId: locationId || undefined,
      search: search || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Admin picker list failed', { error: err.message });
    next(err);
  }
}

/**
 * GET /admin/pickers/:id - Get full picker profile
 */
async function getPickerById(req, res, next) {
  try {
    const { id } = req.params;
    const picker = await pickerApprovalsService.getPickerById(id);
    if (!picker) {
      return res.status(404).json({
        success: false,
        error: { message: 'Picker not found' },
      });
    }
    res.json({ success: true, data: picker });
  } catch (err) {
    logger.error('Admin picker get failed', { error: err.message });
    next(err);
  }
}

/**
 * PATCH /admin/pickers/:id - Update picker status
 * Body: { status: 'ACTIVE'|'REJECTED'|'BLOCKED'|'PENDING', rejectedReason?: string }
 */
async function updatePickerStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, rejectedReason } = req.body;
    if (!status) {
      return res.status(400).json({
        success: false,
        error: { message: 'status is required' },
      });
    }
    if (status === 'REJECTED' && !rejectedReason) {
      return res.status(400).json({
        success: false,
        error: { message: 'rejectedReason is required when status is REJECTED' },
      });
    }
    const approvedBy = req.user?.userId || req.user?.id;
    const picker = await pickerApprovalsService.updatePickerStatus(id, { status, rejectedReason }, approvedBy, req);
    if (!picker) {
      return res.status(404).json({
        success: false,
        error: { message: 'Picker not found' },
      });
    }
    res.json({ success: true, data: picker });
  } catch (err) {
    logger.error('Admin picker update failed', { error: err.message });
    next(err);
  }
}

/**
 * POST /admin/pickers/:id/link-hhd - Link picker to HHD user
 * Body: { hhdUserId: string }
 */
async function linkHhd(req, res, next) {
  try {
    const { id } = req.params;
    const { hhdUserId } = req.body || {};
    if (!hhdUserId) {
      return res.status(400).json({
        success: false,
        error: { message: 'hhdUserId is required' },
      });
    }
    const picker = await pickerApprovalsService.linkHhd(id, hhdUserId);
    res.json({ success: true, data: picker });
  } catch (err) {
    if (err.message === 'Picker not found' || err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: { message: err.message } });
    }
    if (err.message?.includes('Invalid')) {
      return res.status(400).json({ success: false, error: { message: err.message } });
    }
    logger.error('Admin picker link-hhd failed', { error: err.message });
    next(err);
  }
}

/**
 * DELETE /admin/pickers/:id/link-hhd - Unlink picker from HHD user
 */
async function unlinkHhd(req, res, next) {
  try {
    const { id } = req.params;
    const picker = await pickerApprovalsService.unlinkHhd(id);
    res.json({ success: true, data: picker });
  } catch (err) {
    if (err.message === 'Picker not found') {
      return res.status(404).json({ success: false, error: { message: err.message } });
    }
    logger.error('Admin picker unlink-hhd failed', { error: err.message });
    next(err);
  }
}

/**
 * GET /admin/pickers/:id/action-logs - Get picker action logs (audit)
 * Query: startDate, endDate, actionType, limit
 * RBAC: admin, super_admin
 */
async function getPickerActionLogs(req, res, next) {
  try {
    const { id } = req.params;
    const { startDate, endDate, actionType, limit } = req.query;
    const logs = await getLogsByPicker(id, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      actionType: actionType || undefined,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ success: true, data: logs });
  } catch (err) {
    logger.error('Admin picker action logs failed', { error: err.message });
    next(err);
  }
}

/**
 * GET /admin/picker-action-logs - List all picker action logs (audit)
 * Query: pickerId, orderId, actionType, startDate, endDate, page, limit
 * RBAC: admin, super_admin
 */
async function listAllPickerActionLogs(req, res, next) {
  try {
    const { pickerId, orderId, actionType, startDate, endDate, page, limit } = req.query;
    const result = await getAllLogs({
      pickerId: pickerId || undefined,
      orderId: orderId || undefined,
      actionType: actionType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Admin list picker action logs failed', { error: err.message });
    next(err);
  }
}

/**
 * PATCH /admin/pickers/:id/documents/review
 * Body: { docType, side?, action: 'approve'|'reject', reason? }
 */
async function reviewDocument(req, res, next) {
  try {
    const { id } = req.params;
    const { docType, side, action, reason } = req.body || {};
    if (!docType || !['aadhar', 'pan'].includes(docType)) {
      return res.status(400).json({ success: false, error: { message: 'docType must be aadhar or pan' } });
    }
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: { message: 'action must be approve or reject' } });
    }
    if (action === 'approve' && side && !['front', 'back'].includes(side)) {
      return res.status(400).json({ success: false, error: { message: 'side must be front or back' } });
    }

    const picker = await PickerUser.findById(id);
    if (!picker) {
      return res.status(404).json({ success: false, error: { message: 'Picker not found' } });
    }

    const query = { userId: picker._id, docType };
    if (side) query.side = side;
    const update = {
      status: action === 'approve' ? 'approved' : 'rejected',
      rejectionReason: action === 'reject' ? reason || 'Rejected by admin' : null,
      reviewedAt: new Date(),
      reviewedBy: req.user?.userId || req.user?.id || null,
    };
    await PickerDocument.updateMany(query, { $set: update });

    const docs = await PickerDocument.find({ userId: picker._id }).lean();
    const docsStatus = pickerApprovalsService.getDocsStatusFromDocs(docs);
    await PickerUser.findByIdAndUpdate(picker._id, { $set: { docsStatus } });

    await logAdminAction({
      module: 'admin',
      action: action === 'approve' ? 'picker_document_approved' : 'picker_document_rejected',
      entityType: 'picker',
      entityId: id,
      userId: req.user?.userId || req.user?.id,
      details: { docType, side: side || 'both', reason: reason || '' },
      req,
    });

    const updated = await pickerApprovalsService.getPickerById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('Admin picker document review failed', { error: err.message });
    next(err);
  }
}

/**
 * GET /admin/pickers/:id/training-progress
 */
async function getTrainingProgress(req, res, next) {
  try {
    const { id } = req.params;
    const picker = await PickerUser.findById(id).lean();
    if (!picker) {
      return res.status(404).json({ success: false, error: { message: 'Picker not found' } });
    }
    const [videos, watchRows] = await Promise.all([
      TrainingVideo.find({ isActive: true }).sort({ order: 1 }).lean(),
      WatchHistory.find({ userId: picker._id }).lean(),
    ]);
    const byVideoId = Object.fromEntries(watchRows.map((row) => [row.videoId, row]));
    const items = videos.map((video) => {
      const row = byVideoId[video.videoId];
      const watchedSeconds = row?.watchedSeconds || 0;
      const progress = video.duration > 0 ? Math.min(100, Math.round((watchedSeconds / video.duration) * 100)) : 0;
      return {
        videoId: video.videoId,
        title: video.title,
        watchedSeconds,
        duration: video.duration,
        progress,
        completed: !!row?.completedAt,
        completedAt: row?.completedAt || null,
      };
    });
    res.json({
      success: true,
      data: {
        pickerId: picker._id.toString(),
        overallCompleted: items.length > 0 && items.every((row) => row.completed),
        videos: items,
      },
    });
  } catch (err) {
    logger.error('Admin picker training progress failed', { error: err.message });
    next(err);
  }
}

/**
 * PATCH /admin/pickers/:id/bank/:accountId/review
 * Body: { action: 'approve'|'reject', reason? }
 */
async function reviewBankAccount(req, res, next) {
  try {
    const { id, accountId } = req.params;
    const { action, reason } = req.body || {};
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: { message: 'action must be approve or reject' } });
    }
    const picker = await PickerUser.findById(id).lean();
    if (!picker) {
      return res.status(404).json({ success: false, error: { message: 'Picker not found' } });
    }
    const bank = await BankAccount.findOne({ _id: accountId, userId: picker._id });
    if (!bank) {
      return res.status(404).json({ success: false, error: { message: 'Bank account not found' } });
    }
    bank.isVerified = action === 'approve';
    bank.payoutVerificationStatus = action === 'approve' ? 'verified' : 'rejected';
    bank.payoutRejectionReason = action === 'reject' ? reason || 'Rejected by admin' : '';
    await bank.save();

    await logAdminAction({
      module: 'admin',
      action: action === 'approve' ? 'picker_bank_approved' : 'picker_bank_rejected',
      entityType: 'picker',
      entityId: id,
      userId: req.user?.userId || req.user?.id,
      details: { accountId, reason: reason || '' },
      req,
    });

    const updated = await pickerApprovalsService.getPickerById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('Admin picker bank review failed', { error: err.message });
    next(err);
  }
}

/**
 * GET /admin/pickers/:id/face-verification
 */
async function getFaceVerification(req, res, next) {
  try {
    const { id } = req.params;
    const picker = await PickerUser.findById(id).lean();
    if (!picker) {
      return res.status(404).json({ success: false, error: { message: 'Picker not found' } });
    }
    res.json({
      success: true,
      data: {
        pickerId: picker._id.toString(),
        faceVerification: !!picker.faceVerificationVerifiedAt,
        status: picker.faceVerificationStatus || 'pending',
        verifiedAt: picker.faceVerificationVerifiedAt || null,
        confidence: picker.faceVerificationConfidence ?? null,
        overrideBy: picker.faceVerificationOverrideBy || null,
        overrideReason: picker.faceVerificationOverrideReason || '',
        overrideAt: picker.faceVerificationOverrideAt || null,
      },
    });
  } catch (err) {
    logger.error('Admin picker face verification fetch failed', { error: err.message });
    next(err);
  }
}

/**
 * PATCH /admin/pickers/:id/face-verification/override
 * Body: { action: 'approve'|'reject', reason }
 */
async function overrideFaceVerification(req, res, next) {
  try {
    const { id } = req.params;
    const { action, reason } = req.body || {};
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: { message: 'action must be approve or reject' } });
    }
    const picker = await PickerUser.findById(id);
    if (!picker) {
      return res.status(404).json({ success: false, error: { message: 'Picker not found' } });
    }
    picker.faceVerificationStatus = action === 'approve' ? 'overridden_approved' : 'overridden_rejected';
    picker.faceVerificationVerifiedAt = action === 'approve' ? new Date() : null;
    picker.faceVerificationOverrideBy = req.user?.userId || req.user?.id || null;
    picker.faceVerificationOverrideReason = reason || '';
    picker.faceVerificationOverrideAt = new Date();
    await picker.save();

    await logAdminAction({
      module: 'admin',
      action: action === 'approve' ? 'picker_face_verification_approved' : 'picker_face_verification_rejected',
      entityType: 'picker',
      entityId: id,
      userId: req.user?.userId || req.user?.id,
      details: { reason: reason || '' },
      req,
    });

    const updated = await pickerApprovalsService.getPickerById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('Admin picker face verification override failed', { error: err.message });
    next(err);
  }
}

module.exports = {
  listPickers,
  getPickerById,
  updatePickerStatus,
  linkHhd,
  unlinkHhd,
  getPickerActionLogs,
  listAllPickerActionLogs,
  reviewDocument,
  getTrainingProgress,
  reviewBankAccount,
  getFaceVerification,
  overrideFaceVerification,
};
