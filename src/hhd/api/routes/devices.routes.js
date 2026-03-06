/**
 * HHD Devices routes - GET /devices/current
 */
const express = require('express');
const { protect } = require('../../middleware/auth');
const { getCurrentDevice } = require('../controllers/devices.controller');

const router = express.Router();
router.use(protect);
router.get('/current', getCurrentDevice);

module.exports = router;
