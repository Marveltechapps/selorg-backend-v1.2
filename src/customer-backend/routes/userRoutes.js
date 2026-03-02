const { Router } = require('express');
const { getProfile, updateProfile, changePassword } = require('../controllers/userController');
const auth = require('../middleware/auth');

const router = Router();
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.put('/change-password', auth, changePassword);
module.exports = router;
