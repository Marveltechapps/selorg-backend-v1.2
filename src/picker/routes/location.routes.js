/**
 * Location Routes
 * API endpoints for work location management
 */
const express = require('express');
const locationController = require('../controllers/location.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// Get all locations (with optional filtering by user coordinates)
router.get('/locations', requireAuth, locationController.getLocations);

// Get nearest location to user
router.post('/locations/nearest', requireAuth, locationController.getNearestLocation);

// Get specific location by ID
router.get('/locations/:locationId', requireAuth, locationController.getLocationById);

// Validate if user is within geofence
router.post('/locations/validate', requireAuth, locationController.validateLocation);

// Set user's work location
router.post('/locations/set', requireAuth, locationController.setUserLocation);

// Track user's current location
router.post('/locations/track', requireAuth, locationController.trackUserLocation);

module.exports = router;
