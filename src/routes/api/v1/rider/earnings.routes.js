/**
 * Rider Earnings Routes
 * File: src/routes/api/v1/rider/earnings.routes.js
 *
 * P2.1: Rider earnings and payouts
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../../../middleware/authJWT');
const { requireRole } = require('../../../../middleware/roleAuth.middleware');
const ResponseFormatter = require('../../../../core/utils/ResponseFormatter');

/**
 * GET /api/v1/rider/earnings
 * Get earnings summary
 */
router.get('/', authenticateJWT, requireRole('RIDER'), async (req, res, next) => {
  try {
    const data = {
      todayEarnings: 125.5,
      weekEarnings: 500.0,
      monthEarnings: 2000.0,
      totalEarnings: 5000.0,
      pendingPayout: 125.5,
    };
    res.status(200).json(ResponseFormatter.success({ earnings: data }, 'Earnings summary'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/rider/earnings/history
 * Get earnings history
 */
router.get('/history', authenticateJWT, requireRole('RIDER'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const items = [
      {
        date: '2026-05-01',
        deliveries: 10,
        earnings: 125.5,
        status: 'PENDING',
      },
    ];
    res
      .status(200)
      .json(ResponseFormatter.paginated(items, items.length, page, limit, { message: 'Earnings history' }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
