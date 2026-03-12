/**
 * Picker Config routes
 * GET /config - Public, no auth. Returns config for Picker app.
 */
const express = require('express');
const pickerConfigService = require('../services/pickerConfig.service');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const config = await pickerConfigService.getConfig();
    res.status(200).json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
