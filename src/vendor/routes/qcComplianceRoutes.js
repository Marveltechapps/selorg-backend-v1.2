const express = require('express');
const router = express.Router();
const qcComplianceController = require('../controllers/qcComplianceController');
const { authenticateToken } = require('../../core/middleware/auth.middleware');
const asyncHandler = require('../../middleware/asyncHandler');

// All routes require authentication
router.use(authenticateToken);

// Audits
router.get('/audits', asyncHandler(qcComplianceController.getAudits));
router.get('/audits/:id', asyncHandler(qcComplianceController.getAuditById));
router.post('/audits', asyncHandler(qcComplianceController.createAudit));

// Temperature Compliance
router.get('/temperature', asyncHandler(qcComplianceController.getTemperatureCompliance));
router.post('/temperature', asyncHandler(qcComplianceController.createTemperatureCompliance));
router.patch('/temperature/:tempId', asyncHandler(qcComplianceController.patchTemperatureCompliance));

// Vendor Ratings
router.get('/ratings', asyncHandler(qcComplianceController.getVendorRatings));
router.post('/ratings/:vendorId/recalculate', asyncHandler(qcComplianceController.recalculateVendorRating));

module.exports = router;
