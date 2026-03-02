/**
 * Picker Controller
 * Handles all picker-related business logic with real DB operations
 */

const Picker = require('../models/Picker');

const DEFAULT_STORE = process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';

function toFrontendPicker(doc) {
  if (!doc) return null;
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: d.id,
    name: d.name,
    avatar: d.avatar || (d.name || '?').slice(0, 2).toUpperCase(),
    status: d.status || 'available',
    zoneExpertise: d.zone_expertise || [],
  };
}

/**
 * Get Available Pickers
 * GET /api/v1/darkstore/pickers/available
 */
const getAvailablePickers = async (req, res) => {
  try {
    const storeId = req.query.storeId || DEFAULT_STORE;
    const query = { status: 'available' };
    if (storeId) query.store_id = storeId;

    const pickers = await Picker.find(query).lean();
    const data = pickers.map(toFrontendPicker);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch available pickers',
    });
  }
};

module.exports = {
  getAvailablePickers,
};
