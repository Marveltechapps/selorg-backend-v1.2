'use strict';

const express = require('express');
const { validateBody } = require('../middleware/validateZod.middleware');
const { estimateBody } = require('../validators/estimate.zod');
const logisticsEstimate = require('../controllers/logisticsEstimate.controller');

const router = express.Router();

router.post('/', validateBody(estimateBody), logisticsEstimate.estimate);

module.exports = router;
