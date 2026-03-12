/**
 * Admin routes for Picker Config
 * GET /admin/picker-config, PUT /admin/picker-config
 */
const express = require('express');
const pickerConfigService = require('../../picker/services/pickerConfig.service');
const { asyncHandler } = require('../../core/middleware');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const config = await pickerConfigService.getConfigForAdmin();
  res.json({ success: true, data: config });
}));

router.put('/', asyncHandler(async (req, res) => {
  const updated = await pickerConfigService.updateConfig(req.body);
  res.json({ success: true, data: updated });
}));

module.exports = router;
