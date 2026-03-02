const express = require('express');
const router = express.Router();
const procurementApprovalsController = require('../controllers/procurementApprovalsController');

router.get('/summary', procurementApprovalsController.getSummary);
router.get('/tasks', procurementApprovalsController.listTasks);
router.get('/tasks/:id', procurementApprovalsController.getTaskById);
router.post('/tasks/:id/decision', procurementApprovalsController.submitDecision);

module.exports = router;
