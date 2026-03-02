const express = require('express');
const router = express.Router();
const qcController = require('../controllers/qcController');

// Inspections
router.get('/inspections', qcController.getInspections);
router.post('/inspections', qcController.createInspection);
router.get('/inspections/:id', qcController.getInspectionDetails);
router.get('/inspections/:id/report', qcController.getInspectionDetails); // Reusing details as report for now
router.put('/inspections/:id/update', qcController.updateInspection);

// Temperature Logs
router.get('/temperature-logs', qcController.getTemperatureLogs);
router.post('/temperature-logs', qcController.createTemperatureLog);
router.get('/temperature-logs/:id/chart', qcController.getTempChart);

// Rejections
router.get('/rejections', qcController.getRejections);
router.post('/rejections', qcController.logRejection);

// Compliance Docs
router.get('/compliance-docs', qcController.getComplianceDocs);
router.get('/compliance-docs/:id', qcController.getComplianceDoc);
router.get('/compliance-docs/:id/view', qcController.getComplianceDoc);
router.get('/compliance-docs/:id/download', qcController.getComplianceDoc);

// Sample Tests
router.get('/samples', qcController.getSamples);
router.post('/samples', qcController.createSample);
router.get('/samples/:id/report', qcController.updateSample); // Placeholder
router.put('/samples/:id/update', qcController.updateSample);

// Compliance Checks
router.get('/checks', qcController.getComplianceChecks);
router.put('/checks/:id', qcController.toggleComplianceCheck);

module.exports = router;

