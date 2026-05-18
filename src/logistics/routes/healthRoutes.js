'use strict';

const express = require('express');
const { asyncHandler } = require('../../core/middleware');
const { getHealth } = require('../controllers/healthController');

const router = express.Router();

router.get('/', asyncHandler(getHealth));

module.exports = router;
