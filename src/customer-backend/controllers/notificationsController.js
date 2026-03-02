const { listByUserId, markRead, markAllRead } = require('../services/notificationsService');

async function list(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const result = await listByUserId(userId, page, limit);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('notifications list error:', err);
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

module.exports = { list, markOneRead, markAllReadHandler };
