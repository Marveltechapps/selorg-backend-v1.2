/**
 * Rider Fleet Staff & Shifts Routes
 * Mounted at /api/v1/staff
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/middleware');
const staffController = require('../controllers/staffController');

router.use(authenticateToken);

router.get('/summary', staffController.getSummary);
router.get('/', staffController.listRiders);
router.get('/shifts', staffController.listShifts);
router.get('/shifts/:id', staffController.getShiftById);
router.post('/shifts', staffController.createShift);
router.put('/shifts/:id', staffController.updateShift);

module.exports = router;
