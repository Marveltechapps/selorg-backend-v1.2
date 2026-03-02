/**
 * Picker Controller
 * Handles all picker-related business logic
 */

/**
 * Get Available Pickers
 * GET /api/darkstore/pickers/available
 */
const getAvailablePickers = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Available pickers fetched successfully',
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

