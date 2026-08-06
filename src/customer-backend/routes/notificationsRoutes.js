const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  list,
  unreadCount,
  markOneRead,
  markOneUnread,
  markAllReadHandler,
  deleteOne,
  vapidPublicKey,
} = require('../controllers/notificationsController');
const {
  registerToken,
  removeToken,
  removeAllTokens,
  registerWebPush,
} = require('../controllers/pushTokenController');
const {
  getPreferencesHandler,
  updatePreferencesHandler,
} = require('../controllers/notificationPreferencesController');

const router = Router();
router.get('/preferences', auth, getPreferencesHandler);
router.put('/preferences', auth, updatePreferencesHandler);
router.get('/vapid-public-key', vapidPublicKey);
router.get('/unread-count', auth, unreadCount);
router.get('/', auth, list);
router.put('/read-all', auth, markAllReadHandler);
router.put('/:id/read', auth, markOneRead);
router.put('/:id/unread', auth, markOneUnread);
router.delete('/:id', auth, deleteOne);
router.post('/register-token', auth, registerToken);
router.post('/register-web-push', auth, registerWebPush);
router.post('/remove-token', auth, removeToken);
router.post('/remove-all-tokens', auth, removeAllTokens);

module.exports = router;
