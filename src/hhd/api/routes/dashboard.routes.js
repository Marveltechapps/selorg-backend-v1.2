const express = require('express');
const { getDashboard } = require('../controllers/dashboard.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();

// All dashboard routes require authentication
router.use(protect);

// GET /api/dashboard - Get homepage dashboard data
router.get('/', getDashboard);

module.exports = router;
