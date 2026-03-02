const express = require('express');
const router = express.Router();

// Controllers
const hrController = require('../controllers/hrController');
const documentController = require('../controllers/documentController');
const trainingController = require('../controllers/trainingController');
const accessController = require('../controllers/accessController');
const complianceController = require('../controllers/complianceController');
const contractController = require('../controllers/contractController');
const riderHrController = require('../controllers/riderHrController');

// HR Dashboard
router.get('/dashboard/summary', hrController.getHrDashboardSummary);

// Documents
router.get('/documents', documentController.listDocuments);
router.get('/documents/:documentId', documentController.getDocumentDetails);
router.put('/documents/:documentId', documentController.reviewDocument);
router.get('/documents/:documentId/rejection-reason', documentController.getDocumentRejectionReason);
router.get('/documents/:documentId/history', documentController.getDocumentHistory);

// Training
router.get('/training', trainingController.listTrainingProgress);
router.get('/training/:riderId', trainingController.getRiderTrainingDetails);
router.put('/training/:riderId', trainingController.markTrainingCompleted);

// Access & Devices
router.get('/access', accessController.listRiderAccess);
router.put('/access/:riderId', accessController.updateRiderAccess);
router.post('/devices/:riderId', accessController.assignDevice);
router.delete('/devices/:riderId', accessController.unassignDevice);

// Compliance
router.get('/compliance/alerts', complianceController.listComplianceAlerts);
router.get('/compliance/:riderId/suspension', complianceController.getRiderSuspension);
router.put('/compliance/:riderId/suspension', complianceController.manageSuspension);
router.get('/compliance/:riderId/violations', complianceController.getRiderViolations);

// Contracts
router.get('/contracts', contractController.listContracts);
router.get('/contracts/:riderId', contractController.getRiderContract);
router.put('/contracts/:riderId', contractController.updateRiderContract);
router.post('/contracts/:riderId/renew', contractController.renewContract);
router.post('/contracts/:riderId/terminate', contractController.terminateContract);

// Riders (HR)
router.get('/riders', riderHrController.listRiders);
router.post('/riders', riderHrController.onboardRider);
router.get('/riders/:riderId', riderHrController.getRiderDetails);
router.put('/riders/:riderId', riderHrController.updateRider);
router.post('/riders/:riderId/remind', riderHrController.sendReminder);

module.exports = router;

