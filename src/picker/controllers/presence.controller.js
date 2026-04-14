/**
 * POST /presence/ping — minimal lastSeenAt update for picker presence.
 */
const PickerUser = require('../models/user.model');

async function postPing(req, res) {
  try {
    const pickerId = req.userId;
    if (!pickerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const now = new Date();
    await PickerUser.updateOne({ _id: pickerId }, { $set: { lastSeenAt: now } });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Ping failed' });
  }
}

module.exports = { postPing };
