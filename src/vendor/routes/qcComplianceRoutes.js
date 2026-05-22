const express = require('express');
const router = express.Router();
const qcComplianceController = require('../controllers/qcComplianceController');
const { authenticateToken } = require('../../core/middleware/auth.middleware');
const asyncHandler = require('../../middleware/asyncHandler');

// All routes require authentication
router.use(authenticateToken);

router.post('/certificates', asyncHandler(qcComplianceController.createHubCertificate));
router.patch('/certificates/:certId', asyncHandler(qcComplianceController.updateHubCertificate));
router.delete('/certificates/:certId', asyncHandler(qcComplianceController.deleteHubCertificate));

router.get('/certificates', asyncHandler(qcComplianceController.getHubCertificates));

// Audits
router.get('/audits', asyncHandler(qcComplianceController.getAudits));
router.get('/audits/:id', asyncHandler(qcComplianceController.getAuditById));
router.patch('/audits/:id', asyncHandler(qcComplianceController.updateAudit));
router.delete('/audits/:id', asyncHandler(qcComplianceController.deleteAudit));
router.post('/audits', asyncHandler(qcComplianceController.createAudit));

// Temperature Compliance
router.get('/temperature', asyncHandler(qcComplianceController.getTemperatureCompliance));
router.post('/temperature', asyncHandler(qcComplianceController.createTemperatureCompliance));
router.patch('/temperature/:tempId', asyncHandler(qcComplianceController.patchTemperatureCompliance));
router.delete('/temperature/:tempId', asyncHandler(qcComplianceController.deleteTemperatureCompliance));

// Vendor Ratings
router.get('/ratings', asyncHandler(qcComplianceController.getVendorRatings));
router.patch('/ratings/:vendorId', asyncHandler(qcComplianceController.updateVendorRating));
router.delete('/ratings/:vendorId', asyncHandler(qcComplianceController.deleteVendorRating));
router.post('/ratings/:vendorId/recalculate', asyncHandler(qcComplianceController.recalculateVendorRating));

module.exports = router;
