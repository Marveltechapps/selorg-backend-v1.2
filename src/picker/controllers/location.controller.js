/**
 * Location Controller
 * Handles HTTP requests for work location operations
 */
const locationService = require('../services/location.service');
const { validateReportedGpsAccuracy } = require('../constants/shiftGeofence');
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
 * Body: { locationId, latitude, longitude, radiusMeters? } — default 200m geofence
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

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (
      latitude == null ||
      longitude == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return res.status(400).json({
        success: false,
        message: 'User coordinates (latitude, longitude) are required'
      });
    }

    const accuracyError = validateReportedGpsAccuracy(req.body.accuracyMeters);
    if (accuracyError) {
      return res.status(400).json({
        success: false,
        message: accuracyError,
      });
    }

    const radiusMeters =
      req.body.radiusMeters != null ? parseFloat(req.body.radiusMeters) : undefined;

    const validation = await locationService.validateLocation(
      locationId,
      lat,
      lng,
      radiusMeters
    );
    
    success(res, validation);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /locations/set-darkstore-from-current
 * Assign nearest darkstore using device GPS coordinates.
 * Body: { latitude, longitude }
 */
const setDarkstoreFromCurrent = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
    }

    const { address, capturedAt } = req.body;

    const result = await locationService.setDarkstoreFromCurrentLocation(
      req.userId,
      latitude,
      longitude,
      { address, capturedAt }
    );

    success(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /locations/ensure-darkstore-verification
 * Set device GPS as the darkstore verification anchor when missing or invalid.
 * Body: { latitude, longitude, address?, capturedAt? }
 */
const ensureDarkstoreVerification = async (req, res, next) => {
  try {
    const { latitude, longitude, address, capturedAt } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
    }

    const result = await locationService.ensureDarkstoreVerificationAnchor(req.userId, {
      latitude,
      longitude,
      address,
      capturedAt,
    });

    success(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /locations/save-darkstore-gps
 * Save device GPS as the official darkstore coordinates.
 * Body: { locationId, latitude, longitude, address?, capturedAt? }
 */
const saveDarkstoreGps = async (req, res, next) => {
  try {
    const { locationId, latitude, longitude, address, capturedAt } = req.body;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'Location ID is required',
      });
    }

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
    }

    const result = await locationService.persistDarkstoreGpsCoordinates(locationId, {
      latitude,
      longitude,
      address,
      capturedAt,
    });

    success(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /locations/set
 * Set user's work location
 * Body: { locationId, locationType, latitude?, longitude?, address?, capturedAt? }
 */
const setUserLocation = async (req, res, next) => {
  try {
    const { locationId, locationType, latitude, longitude, address, capturedAt } = req.body;
    const userId = req.userId; // From auth middleware

    if (!locationId || !locationType) {
      return res.status(400).json({
        success: false,
        message: 'Location ID and location type are required'
      });
    }

    const gpsPayload =
      latitude != null && longitude != null
        ? { latitude, longitude, address, capturedAt }
        : null;

    const result = await locationService.setUserLocation(
      userId,
      locationId,
      locationType,
      gpsPayload
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
  ensureDarkstoreVerification,
  setDarkstoreFromCurrent,
  saveDarkstoreGps,
  setUserLocation,
  trackUserLocation,
};
