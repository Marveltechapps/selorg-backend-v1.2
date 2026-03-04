const { getBootstrapPayload } = require('../services/bootstrapService');

async function getBootstrap(req, res) {
  try {
    const data = await getBootstrapPayload(req);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('getBootstrap error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getBootstrap };
