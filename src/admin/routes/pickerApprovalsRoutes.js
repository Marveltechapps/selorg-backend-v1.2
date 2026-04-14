/**
 * Admin Picker Approvals Routes
 * Workforce approval workflow for picker users.
 * RBAC: Admin or Workforce role.
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../core/middleware');
const pickerApprovalsController = require('../controllers/pickerApprovals.controller');

const router = express.Router();
const adminOrWorkforce = [authenticateToken, requireRole('admin', 'super_admin', 'workforce')];

router.get('/', ...adminOrWorkforce, pickerApprovalsController.listPickers);
router.get('/:id/action-logs', ...adminOrWorkforce, pickerApprovalsController.getPickerActionLogs);
router.get('/:id/training-progress', ...adminOrWorkforce, pickerApprovalsController.getTrainingProgress);
router.get('/:id/face-verification', ...adminOrWorkforce, pickerApprovalsController.getFaceVerification);
router.post('/:id/link-hhd', ...adminOrWorkforce, pickerApprovalsController.linkHhd);
router.delete('/:id/link-hhd', ...adminOrWorkforce, pickerApprovalsController.unlinkHhd);
router.patch('/:id/documents/review', ...adminOrWorkforce, pickerApprovalsController.reviewDocument);
router.patch('/:id/bank/:accountId/review', ...adminOrWorkforce, pickerApprovalsController.reviewBankAccount);
router.patch('/:id/face-verification/override', ...adminOrWorkforce, pickerApprovalsController.overrideFaceVerification);
router.get('/:id', ...adminOrWorkforce, pickerApprovalsController.getPickerById);
router.patch('/:id', ...adminOrWorkforce, pickerApprovalsController.updatePickerStatus);

module.exports = router;
