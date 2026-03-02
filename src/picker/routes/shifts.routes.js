/**
 * Shifts routes – from backend-workflow.yaml (shifts/available, shifts/select, shifts/start, shifts/end).
 */
const express = require('express');
const shiftsController = require('../controllers/shifts.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/available', requireAuth, shiftsController.getAvailable);
router.post('/select', requireAuth, shiftsController.select);
router.post('/start', requireAuth, shiftsController.start);
router.post('/end', requireAuth, shiftsController.end);

module.exports = router;
