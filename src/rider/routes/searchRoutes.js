const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const appConfig = require('../config/app');
const { validateSearch } = require('../../middleware/validator');

// Conditional search validation middleware
// Skip validation in development mode, enforce in production
const conditionalValidateSearch = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next() // Skip validation in development
  : validateSearch; // Apply validation in production

// GET /search - Unified search
router.get('/', conditionalValidateSearch, searchController.unifiedSearch);

module.exports = router;

