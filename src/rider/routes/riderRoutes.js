const express = require('express');
const router = express.Router();
const riderController = require('../controllers/riderController');
const appConfig = require('../../config/app');
const { cacheMiddleware } = require('../../core/middleware');
const {
  validateRiderId,
  validateCreateRider,
  validateUpdateRider,
} = require('../../middleware/validator');

// Conditional rider ID validation middleware
// Skip validation in development mode, enforce in production
const conditionalValidateRiderId = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next() // Skip validation in development
  : validateRiderId; // Apply validation in production

// GET /riders - List all riders (cached)
router.get('/', cacheMiddleware(appConfig.cache.riders), riderController.listRiders);

// POST /riders - Create a new rider
router.post('/', validateCreateRider, riderController.createRider);

// GET /riders/distribution - Get rider distribution statistics (cached)
router.get('/distribution', cacheMiddleware(appConfig.cache.riders), riderController.getRiderDistribution);

// GET /riders/:riderId - Get rider by ID (cached)
router.get('/:riderId', cacheMiddleware(appConfig.cache.riders), conditionalValidateRiderId, riderController.getRiderById);

// PUT /riders/:riderId - Update rider
router.put('/:riderId', conditionalValidateRiderId, validateUpdateRider, riderController.updateRider);

// GET /riders/:riderId/location - Get rider location (short TTL)
router.get('/:riderId/location', cacheMiddleware(appConfig.cache.location), conditionalValidateRiderId, riderController.getRiderLocation);

module.exports = router;

