const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const { linkPickerUserToHhd } = require('../controllers/admin.controller');

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.put('/picker-users/:pickerUserId/link', linkPickerUserToHhd);

module.exports = router;
