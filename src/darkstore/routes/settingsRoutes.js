const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');

/**
 * GET /api/darkstore/settings
 * Get application settings
 */
router.get('/', getSettings);

/**
 * PUT /api/darkstore/settings
 * Update application settings
 */
router.put('/', updateSettings);

module.exports = router;

