/**
 * Admin Picker Operations Routes
 * Base: /api/v1/admin/picker/*
 *
 * NOTE: This is separate from legacy /api/v1/admin/pickers (approvals workflow).
 * We keep both to avoid breaking existing clients.
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../core/middleware');
const pickerApprovalsController = require('../controllers/pickerApprovals.controller');
const pickerOpsController = require('../controllers/pickerOps.controller');

const router = express.Router();
const adminOrWorkforce = [authenticateToken, requireRole('admin', 'super_admin', 'workforce')];

// Approvals workflow (new base path used by dashboard frontend)
router.get('/approvals', ...adminOrWorkforce, pickerApprovalsController.listPickers);

// Picker details + review endpoints (match pickerApprovalsApi.ts expectations)
router.get('/pickers/:id/action-logs', ...adminOrWorkforce, pickerApprovalsController.getPickerActionLogs);
router.get('/pickers/:id/training-progress', ...adminOrWorkforce, pickerApprovalsController.getTrainingProgress);
router.get('/pickers/:id/face-verification', ...adminOrWorkforce, pickerApprovalsController.getFaceVerification);
router.post('/pickers/:id/link-hhd', ...adminOrWorkforce, pickerApprovalsController.linkHhd);
router.delete('/pickers/:id/link-hhd', ...adminOrWorkforce, pickerApprovalsController.unlinkHhd);
router.patch('/pickers/:id/documents/review', ...adminOrWorkforce, pickerApprovalsController.reviewDocument);
router.patch('/pickers/:id/bank/:accountId/review', ...adminOrWorkforce, pickerApprovalsController.reviewBankAccount);
router.patch('/pickers/:id/face-verification/override', ...adminOrWorkforce, pickerApprovalsController.overrideFaceVerification);
router.get('/pickers/:id', ...adminOrWorkforce, pickerApprovalsController.getPickerById);
router.patch('/pickers/:id/status', ...adminOrWorkforce, pickerOpsController.updateStatusUnified);

// Picker Management list (new picker ops list API)
router.get('/pickers', ...adminOrWorkforce, pickerOpsController.listPickers);
router.patch('/pickers/:pickerId/assignment', ...adminOrWorkforce, pickerOpsController.updateAssignment);
router.post('/pickers/:pickerId/push', ...adminOrWorkforce, pickerOpsController.sendPickerPush);

// Agencies
router.get('/agencies', ...adminOrWorkforce, pickerOpsController.listAgencies);
router.post('/agencies', ...adminOrWorkforce, pickerOpsController.createAgency);
router.post('/agencies/:agencyId/deactivate', ...adminOrWorkforce, pickerOpsController.deactivateAgency);

// Shift slots per store
router.get('/stores/:storeId/shift-slots', ...adminOrWorkforce, pickerOpsController.listStoreShiftSlots);
router.post('/stores/:storeId/shift-slots', ...adminOrWorkforce, pickerOpsController.createStoreShiftSlot);

// OT approvals
router.get('/ot-requests', ...adminOrWorkforce, pickerOpsController.listOtRequests);
router.post('/ot-requests/:requestId/decision', ...adminOrWorkforce, pickerOpsController.decideOtRequest);

// Shift change approvals
router.get('/shift-change-requests', ...adminOrWorkforce, pickerOpsController.listShiftChangeRequests);
router.post('/shift-change-requests/:requestId/decision', ...adminOrWorkforce, pickerOpsController.decideShiftChangeRequest);

// Attendance export (CSV)
router.get('/attendance/export', ...adminOrWorkforce, pickerOpsController.exportAttendanceCsv);

module.exports = router;

