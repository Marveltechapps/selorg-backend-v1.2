const express = require('express');
const { authenticateToken, requireRole } = require('../../core/middleware');
const dashboardCountsController = require('../controllers/dashboardCountsController');

const router = express.Router();

router.get(
  '/counts',
  authenticateToken,
  requireRole('rider', 'admin', 'super_admin'),
  dashboardCountsController.getDashboardCounts
);

module.exports = router;
