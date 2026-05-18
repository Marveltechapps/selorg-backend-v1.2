'use strict';

const { asyncHandler } = require('../../core/middleware');
const estimateService = require('../services/estimate.service');

const estimate = asyncHandler(async (req, res) => {
  const data = await estimateService.multiEstimate(req.validatedBody);
  res.json({ success: true, data });
});

module.exports = { estimate };
