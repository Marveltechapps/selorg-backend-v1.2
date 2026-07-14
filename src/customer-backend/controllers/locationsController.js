const { searchAddressSuggestions, getApproximateLocation } = require('../services/geocodingService');

async function suggestions(req, res) {
  try {
    const q = String(req.query.q || req.query.query || '').trim();
    if (q.length < 2) {
      return res.status(200).json({ success: true, data: [] });
    }

    const latitude = req.query.latitude != null ? Number(req.query.latitude) : undefined;
    const longitude = req.query.longitude != null ? Number(req.query.longitude) : undefined;

    const data = await searchAddressSuggestions(q, { latitude, longitude });
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('locations suggestions error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function approximate(req, res) {
  try {
    const location = await getApproximateLocation();
    if (!location) {
      return res.status(503).json({
        success: false,
        message: 'Could not determine approximate location',
      });
    }

    res.status(200).json({ success: true, data: location });
  } catch (err) {
    console.error('locations approximate error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { suggestions, approximate };
