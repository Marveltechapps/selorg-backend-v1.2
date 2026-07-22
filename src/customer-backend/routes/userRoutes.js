const { Router } = require('express');
const { getProfile, updateProfile, changePassword, uploadAvatar } = require('../controllers/userController');
const auth = require('../middleware/auth');

const router = Router();
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.post('/profile/avatar', auth, uploadAvatar);
router.put('/change-password', auth, changePassword);
module.exports = router;
