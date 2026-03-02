const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { authenticateToken, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

/**
 * Global Search Routes
 * Search across all modules: orders, products, users, vendors, riders, etc.
 */

// GET /api/v1/shared/search - Global unified search
router.get('/', authenticateToken, cacheMiddleware(appConfig.cache.search), searchController.globalSearch);

// GET /api/v1/shared/search/suggestions - Get search suggestions
router.get('/suggestions', authenticateToken, cacheMiddleware(appConfig.cache.search), searchController.getSuggestions);

// GET /api/v1/shared/search/recent - Get recent searches
router.get('/recent', authenticateToken, cacheMiddleware(appConfig.cache.search), searchController.getRecentSearches);

module.exports = router;
