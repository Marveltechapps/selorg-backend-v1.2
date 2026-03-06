/**
 * Location Controller
 * Handles HTTP requests for work location operations
 */
const locationService = require('../services/location.service');
const { success } = require('../utils/response.util');

/**
 * GET /locations
 * Get all available work locations
 * Query params: lat, lng, radius (optional)
 */
const getLocations = async (req, res, next) => {
  try {
    const { lat, lng, radius } = req.query;
    
    const latitude = lat ? parseFloat(lat) : null;
    const longitude = lng ? parseFloat(lng) : null;
    const radiusKm = radius ? parseFloat(radius) : 50;

    const locations = await locationService.getAllLocations(latitude, longitude, radiusKm);
    
    success(res, {
      locations,
      count: locations.length,
      userCoordinates: latitude && longitude ? { latitude, longitude } : null
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /locations/nearest
 * Get nearest work location to user
 * Body: { latitude, longitude }
 */
const getNearestLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const location = await locationService.getNearestLocation(
      parseFloat(latitude),
      parseFloat(longitude)
    );
    
    success(res, location);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /locations/:locationId
 * Get specific location by ID
 */
const getLocationById = async (req, res, next) => {
  try {
    const { locationId } = req.params;

    const location = await locationService.getLocationById(locationId);
    
    success(res, location);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /locations/validate
 * Validate if user is within geofence of location
 * Body: { locationId, latitude, longitude }
 */
const validateLocation = async (req, res, next) => {
  try {
    const { locationId, latitude, longitude } = req.body;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'Location ID is required'
      });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'User coordinates (latitude, longitude) are required'
      });
    }

    const validation = await locationService.validateLocation(
      locationId,
      parseFloat(latitude),
      parseFloat(longitude)
    );
    
    success(res, validation);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /locations/set
 * Set user's work location
 * Body: { locationId, locationType }
 */
const setUserLocation = async (req, res, next) => {
  try {
    const { locationId, locationType } = req.body;
    const userId = req.userId; // From auth middleware

    if (!locationId || !locationType) {
      return res.status(400).json({
        success: false,
        message: 'Location ID and location type are required'
      });
    }

    const result = await locationService.setUserLocation(
      userId,
      locationId,
      locationType
    );
    
    success(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /stores/nearby
 * Returns store/work location codes within radius (for geo-fenced shift availability).
 * Query: lat, lng, radiusKm (default 3)
 */
const getStoresNearby = async (req, res, next) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat) : null;
    const lng = req.query.lng ? parseFloat(req.query.lng) : null;
    const radiusKm = req.query.radiusKm ? parseFloat(req.query.radiusKm) : 3;

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'lat and lng query params are required',
      });
    }

    const locations = await locationService.getAllLocations(lat, lng, radiusKm);
    const stores = (locations || []).map((l) => ({
      locationId: l.locationId || l._id?.toString(),
      name: l.name,
      distance: l.distance,
      distanceDisplay: l.distanceDisplay,
    }));

    success(res, { stores, count: stores.length });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /locations/current
 * Get current work location for logged-in picker (hubName, hubId, address).
 */
const getCurrentLocation = async (req, res, next) => {
  try {
    const data = await locationService.getCurrentLocationForUser(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /locations/track
 * Update user's last known location
 * Body: { latitude, longitude }
 */
const trackUserLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;
    const userId = req.userId; // From auth middleware

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const result = await locationService.updateUserLastLocation(
      userId,
      parseFloat(latitude),
      parseFloat(longitude)
    );
    
    success(res, result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getLocations,
  getNearestLocation,
  getStoresNearby,
  getLocationById,
  getCurrentLocation,
  validateLocation,
  setUserLocation,
  trackUserLocation,
};
