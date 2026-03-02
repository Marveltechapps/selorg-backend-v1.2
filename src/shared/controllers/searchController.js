const searchService = require('../services/searchService');
const { asyncHandler } = require('../../core/middleware');

/**
 * Global Search Controller
 */

/**
 * @route   GET /api/v1/shared/search
 * @desc    Global unified search across all modules
 * @access  Private
 */
const globalSearch = asyncHandler(async (req, res) => {
  const { q, type = 'all', limit = 10 } = req.query;
  const userId = req.user?.id || req.user?._id;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Search query must be at least 2 characters',
    });
  }

  const results = await searchService.globalSearch(q, type, parseInt(limit), userId);

  res.status(200).json({
    success: true,
    data: results,
  });
});

/**
 * @route   GET /api/v1/shared/search/suggestions
 * @desc    Get search suggestions
 * @access  Private
 */
const getSuggestions = asyncHandler(async (req, res) => {
  const { q, limit = 5 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(200).json({
      success: true,
      data: [],
    });
  }

  const suggestions = await searchService.getSuggestions(q, parseInt(limit));

  res.status(200).json({
    success: true,
    data: suggestions,
  });
});

/**
 * @route   GET /api/v1/shared/search/recent
 * @desc    Get recent searches for user
 * @access  Private
 */
const getRecentSearches = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const { limit = 10 } = req.query;

  const recentSearches = await searchService.getRecentSearches(userId, parseInt(limit));

  res.status(200).json({
    success: true,
    data: recentSearches,
  });
});

module.exports = {
  globalSearch,
  getSuggestions,
  getRecentSearches,
};
