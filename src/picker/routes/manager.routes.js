const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const managerController = require('../controllers/manager.controller');

const router = express.Router();

router.post('/request-otp', requireAuth, managerController.requestOtp);
router.post('/verify-otp', requireAuth, managerController.verifyOtp);

module.exports = router;
