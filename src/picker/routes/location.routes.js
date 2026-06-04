/**
 * Location Routes – API endpoints for work location management.
 * Phase 1 RBAC: Dashboard endpoints for location CRUD will require Warehouse role.
 */
const express = require('express');
const locationController = require('../controllers/location.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// Get current work location for logged-in picker (hubName, hubId, address)
router.get('/locations/current', requireAuth, locationController.getCurrentLocation);

// Get all locations (with optional filtering by user coordinates)
router.get('/locations', requireAuth, locationController.getLocations);

// Get nearest location to user
router.post('/locations/nearest', requireAuth, locationController.getNearestLocation);

// Get stores/locations nearby (for geo-fenced shift availability)
router.get('/stores/nearby', requireAuth, locationController.getStoresNearby);

// Get specific location by ID
router.get('/locations/:locationId', requireAuth, locationController.getLocationById);

// Validate if user is within geofence
router.post('/locations/validate', requireAuth, locationController.validateLocation);

// Set device GPS as darkstore verification anchor (when admin coords are missing/wrong)
router.post(
  '/locations/ensure-darkstore-verification',
  requireAuth,
  locationController.ensureDarkstoreVerification
);

// Set nearest darkstore from device GPS (current location)
router.post(
  '/locations/set-darkstore-from-current',
  requireAuth,
  locationController.setDarkstoreFromCurrent
);

// Save device GPS as official darkstore coordinates
router.post(
  '/locations/save-darkstore-gps',
  requireAuth,
  locationController.saveDarkstoreGps
);

// Set user's work location
router.post('/locations/set', requireAuth, locationController.setUserLocation);

// Track user's current location
router.post('/locations/track', requireAuth, locationController.trackUserLocation);

module.exports = router;
