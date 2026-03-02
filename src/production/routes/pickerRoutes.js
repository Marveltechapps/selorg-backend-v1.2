const express = require('express');
const router = express.Router();
const { getAvailablePickers } = require('../controllers/pickerController');

// GET /api/darkstore/pickers/available
router.get('/available', getAvailablePickers);

module.exports = router;

