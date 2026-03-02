const express = require('express');
const {
  getProfile,
  updateProfile,
  getContract,
  getEmployment,
  getLinkedPickerProfile,
} = require('../controllers/user.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();
router.use(protect);
router.route('/profile').get(getProfile).put(updateProfile);
router.get('/contract', getContract);
router.get('/employment', getEmployment);
router.get('/linked-picker-profile', getLinkedPickerProfile);
module.exports = router;
