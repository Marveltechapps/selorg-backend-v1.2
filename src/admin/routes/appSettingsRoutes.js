const express = require('express');
const { getAppSettings, updateAppSettings } = require('../controllers/appSettingsController');

const router = express.Router();

router.get('/', getAppSettings);
router.put('/', updateAppSettings);

module.exports = router;
