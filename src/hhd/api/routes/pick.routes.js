const express = require('express');
const { reportIssue } = require('../controllers/pick.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();
router.post('/report-issue', protect, reportIssue);
module.exports = router;
