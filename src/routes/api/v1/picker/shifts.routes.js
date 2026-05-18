/**
 * Picker Shifts Routes
 * File: src/routes/api/v1/picker/shifts.routes.js
 *
 * P2.1: Picker shift management endpoints
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../../../middleware/authJWT');
const { requireRole } = require('../../../../middleware/roleAuth.middleware');
const ResponseFormatter = require('../../../../core/utils/ResponseFormatter');

/**
 * GET /api/v1/picker/shifts
 * Get picker's shifts
 */
router.get('/', authenticateJWT, requireRole('PICKER'), async (req, res, next) => {
  try {
    const data = [
      {
        shiftId: 'shift_1',
        date: '2026-05-01',
        startTime: '09:00',
        endTime: '17:00',
        status: 'ACTIVE',
      },
    ];
    res.status(200).json(ResponseFormatter.success({ shifts: data }, 'Shifts'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/picker/shifts
 * Create new shift
 */
router.post('/', authenticateJWT, requireRole('PICKER'), async (req, res, next) => {
  try {
    const { date, startTime, endTime } = req.body;

    if (!date || !startTime || !endTime) {
      return res
        .status(422)
        .json(
          ResponseFormatter.validationError([
            { field: 'date', message: 'Date, startTime, and endTime required' },
            { field: 'startTime', message: 'Date, startTime, and endTime required' },
            { field: 'endTime', message: 'Date, startTime, and endTime required' },
          ])
        );
    }

    res.status(201).json(ResponseFormatter.success({ shiftId: 'shift_new_123' }, 'Shift created successfully'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/picker/shifts/:shiftId
 * Get shift details
 */
router.get('/:shiftId', authenticateJWT, requireRole('PICKER'), async (req, res, next) => {
  try {
    const { shiftId } = req.params;
    const data = {
      shiftId,
      date: '2026-05-01',
      startTime: '09:00',
      endTime: '17:00',
      ordersCompleted: 5,
      status: 'ACTIVE',
    };
    res.status(200).json(ResponseFormatter.success({ shift: data }, 'Shift detail'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
