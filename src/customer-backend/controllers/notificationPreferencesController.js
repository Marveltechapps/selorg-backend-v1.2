const {
  getPreferences,
  updatePreferences,
} = require('../services/notificationPreferencesService');

async function getPreferencesHandler(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const preferences = await getPreferences(userId);
    res.status(200).json({ success: true, data: preferences });
  } catch (err) {
    console.error('notifications getPreferences error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updatePreferencesHandler(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await updatePreferences(userId, req.body || {});
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }
    res.status(200).json({ success: true, data: result.preferences });
  } catch (err) {
    console.error('notifications updatePreferences error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getPreferencesHandler, updatePreferencesHandler };
