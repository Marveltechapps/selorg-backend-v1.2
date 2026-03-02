const { Router } = require('express');
const auth = require('../middleware/auth');
const { list, markOneRead, markAllReadHandler } = require('../controllers/notificationsController');
const { registerToken, removeToken } = require('../controllers/pushTokenController');

const router = Router();
router.get('/', auth, list);
router.put('/read-all', auth, markAllReadHandler);
router.put('/:id/read', auth, markOneRead);
router.post('/register-token', auth, registerToken);
router.post('/remove-token', auth, removeToken);

module.exports = router;
