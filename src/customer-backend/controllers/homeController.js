const { getHomePayload } = require('../services/homeService');

async function getHome(req, res) {
  try {
    const data = await getHomePayload(req);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('getHome error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getHome };
