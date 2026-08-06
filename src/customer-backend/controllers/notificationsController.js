const {
  listByUserId,
  markRead,
  markUnread,
  markAllRead,
  removeOne,
  getUnreadCount,
} = require('../services/notificationsService');
const { getPublicVapidKey, isWebPushConfigured } = require('../services/webPushService');

async function list(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const category = req.query.category || undefined;
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const result = await listByUserId(userId, page, limit, { category, unreadOnly });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('notifications list error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function unreadCount(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const count = await getUnreadCount(userId);
    res.status(200).json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    console.error('notifications unreadCount error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function markOneRead(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await markRead(userId, req.params.id);
    if (!data) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('notifications markRead error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function markOneUnread(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await markUnread(userId, req.params.id);
    if (!data) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('notifications markUnread error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function markAllReadHandler(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    await markAllRead(userId);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('notifications markAllRead error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function deleteOne(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await removeOne(userId, req.params.id);
    if (!data) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('notifications delete error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function vapidPublicKey(req, res) {
  try {
    const key = getPublicVapidKey();
    if (!key || !isWebPushConfigured()) {
      res.status(503).json({
        success: false,
        message: 'Web Push is not configured on the server',
      });
      return;
    }
    res.status(200).json({ success: true, data: { publicKey: key } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  list,
  unreadCount,
  markOneRead,
  markOneUnread,
  markAllReadHandler,
  deleteOne,
  vapidPublicKey,
};
