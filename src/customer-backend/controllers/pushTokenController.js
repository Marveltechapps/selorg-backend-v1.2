const { PushToken } = require('../models/PushToken');

async function registerToken(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { token, platform } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }

    await PushToken.findOneAndUpdate(
      { userId, token },
      { userId, token, platform: platform || 'android', active: true },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: 'Push token registered' });
  } catch (err) {
    console.error('registerToken error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function removeToken(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }

    await PushToken.findOneAndUpdate(
      { userId, token },
      { $set: { active: false } }
    );

    res.status(200).json({ success: true, message: 'Push token removed' });
  } catch (err) {
    console.error('removeToken error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { registerToken, removeToken };
