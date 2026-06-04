/**
 * Location Service
 * Handles work location operations, distance calculations, and geofencing
 */
const WorkLocation = require('../models/workLocation.model');
const User = require('../models/user.model');
const Store = require('../../merch/models/Store');
const mongoose = require('mongoose');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');
const { PICKER_SHIFT_GEOFENCE_M } = require('../constants/shiftGeofence');

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers (rounded for display)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const meters = calculateDistanceMeters(lat1, lon1, lat2, lon2);
  return Math.round((meters / 1000) * 10) / 10;
}

/** Precise Haversine distance in meters (used for geofence validation). */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

function isValidGeoPair(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Coordinates used for shift geofence — prefers device-captured darkstore GPS. */
function resolveVerificationCoordinates(location) {
  if (!location) return null;

  const coordLat = Number(location.coordinates?.latitude);
  const coordLng = Number(location.coordinates?.longitude);
  if (isValidGeoPair(coordLat, coordLng)) {
    return {
      latitude: coordLat,
      longitude: coordLng,
      source:
        location.coordinates?.source ||
        location.coordinatesSource ||
        (location._source === 'store' ? 'admin' : 'admin'),
      capturedAt: location.coordinates?.capturedAt ?? location.coordinatesCapturedAt ?? null,
    };
  }

  return null;
}

function normalizePickerLocationFromWorkLocation(location) {
  const lat = Number(location.coordinates?.latitude);
  const lng = Number(location.coordinates?.longitude);
  const hasCoordinates = isValidGeoPair(lat, lng);

  return {
    ...location,
    locationId: String(location.locationId),
    type: location.type === 'darkstore' ? 'darkstore' : 'warehouse',
    coordinates: hasCoordinates
      ? {
          latitude: lat,
          longitude: lng,
          source: location.coordinates?.source || 'admin',
          capturedAt: location.coordinates?.capturedAt ?? null,
        }
      : null,
    coordinatesSource: location.coordinates?.source || 'admin',
    coordinatesCapturedAt: location.coordinates?.capturedAt ?? null,
  };
}

function normalizePickerLocationFromStore(store) {
  let latitude = Number(store.latitude);
  let longitude = Number(store.longitude);
  if (!isValidGeoPair(latitude, longitude)) {
    const x = Number(store.x);
    const y = Number(store.y);
    if (isValidGeoPair(x, y)) {
      latitude = x;
      longitude = y;
    }
  }
  const hasCoordinates = isValidGeoPair(latitude, longitude);

  return {
    _id: store._id,
    locationId: String(store._id),
    name: store.name || store.code || `Store ${store._id}`,
    type: store.type === 'warehouse' ? 'warehouse' : 'darkstore',
    address: store.address || '',
    city: store.city || null,
    state: store.state || null,
    zipCode: store.pincode || null,
    coordinates: hasCoordinates
      ? {
          latitude,
          longitude,
          source: store.coordinatesSource || 'admin',
          capturedAt: store.coordinatesCapturedAt ?? null,
        }
      : null,
    geofence: { radius: 500, shape: 'circle' },
    isActive: true,
    coordinatesCapturedAt: store.coordinatesCapturedAt ?? null,
    coordinatesSource: store.coordinatesSource || 'admin',
    _source: 'store',
  };
}

async function loadActivePickerLocations() {
  const stores = await withTimeout(
    Store.find({
      type: { $in: ['warehouse', 'dark_store', 'store'] },
    })
      .select(
        '_id code name type address city state pincode latitude longitude x y status serviceStatus'
      )
      .sort({ name: 1 })
      .lean(),
    DB_TIMEOUT_MS,
    []
  );

  const normalizedStores = (stores || []).map(normalizePickerLocationFromStore).filter(Boolean);
  if (normalizedStores.length > 0) {
    return normalizedStores;
  }

  const workLocations = await withTimeout(
    WorkLocation.find({ isActive: true }).select('-__v').sort({ name: 1 }).lean(),
    DB_TIMEOUT_MS,
    []
  );

  return (workLocations || [])
    .map(normalizePickerLocationFromWorkLocation)
    .filter((location) => !!location);
}

/**
 * Estimate travel time based on distance
 * Assumes average speed of 30 km/h for city driving
 */
function estimateTravelTime(distanceKm) {
  const averageSpeedKmh = 30;
  const timeHours = distanceKm / averageSpeedKmh;
  const timeMinutes = Math.ceil(timeHours * 60);
  
  if (timeMinutes < 1) return '< 1 min';
  if (timeMinutes === 1) return '1 min';
  return `${timeMinutes} min`;
}

/**
 * Get all available work locations
 * Optionally filter by user coordinates and radius
 */
const getAllLocations = async (latitude, longitude, radiusKm = 50) => {
  const locations = await loadActivePickerLocations();

  if (!locations) {
    throw new Error('Failed to fetch locations');
  }

  // If coordinates provided, calculate distances and filter by radius
  if (latitude && longitude) {
    const locationsWithDistance = locations.map(location => {
      if (!location.coordinates) {
        return {
          ...location,
          distance: null,
          travelTime: null,
          distanceDisplay: null,
          withinRadius: false,
        };
      }
      const distance = calculateDistance(
        latitude,
        longitude,
        location.coordinates.latitude,
        location.coordinates.longitude
      );

      const travelTime = estimateTravelTime(distance);

      return {
        ...location,
        distance,
        travelTime,
        distanceDisplay: `${distance} km`,
        withinRadius: distance <= radiusKm
      };
    });

    // Filter by radius and sort by distance
    const withCoordinates = locationsWithDistance
      .filter((loc) => loc.withinRadius && Number.isFinite(loc.distance))
      .sort((a, b) => a.distance - b.distance);

    // If no geo-match is available, still return master-data rows so picker can continue.
    return withCoordinates.length > 0 ? withCoordinates : locationsWithDistance;
  }

  // Return all locations without distance info
  return locations.map(loc => ({
    ...loc,
    distance: null,
    travelTime: null,
    distanceDisplay: null
  }));
};

/**
 * Get nearest darkstore work location to user coordinates.
 */
const getNearestDarkstoreLocation = async (latitude, longitude) => {
  if (!latitude || !longitude) {
    throw new Error('Latitude and longitude are required');
  }

  const locations = await loadActivePickerLocations();
  const darkstores = (locations || []).filter(
    (loc) => loc.type === 'darkstore' && loc.coordinates
  );

  if (!darkstores.length) {
    throw new Error('No active darkstore locations found');
  }

  const locationsWithDistance = darkstores.map((location) => {
    const distance = calculateDistance(
      latitude,
      longitude,
      location.coordinates.latitude,
      location.coordinates.longitude
    );
    const travelTime = estimateTravelTime(distance);
    return {
      ...location,
      distance,
      travelTime,
      distanceDisplay: `${distance} km`,
    };
  });

  locationsWithDistance.sort((a, b) => a.distance - b.distance);
  return locationsWithDistance[0];
};

/**
 * Get nearest work location to user
 */
const getNearestLocation = async (latitude, longitude) => {
  if (!latitude || !longitude) {
    throw new Error('Latitude and longitude are required');
  }

  const locations = await loadActivePickerLocations();

  if (!locations || locations.length === 0) {
    throw new Error('No active locations found');
  }

  // Calculate distances for all locations
  const locationsWithDistance = locations.map(location => {
    if (!location.coordinates) {
      return {
        ...location,
        distance: Number.MAX_SAFE_INTEGER,
        travelTime: null,
        distanceDisplay: null,
      };
    }
    const distance = calculateDistance(
      latitude,
      longitude,
      location.coordinates.latitude,
      location.coordinates.longitude
    );

    const travelTime = estimateTravelTime(distance);

    return {
      ...location,
      distance,
      travelTime,
      distanceDisplay: `${distance} km`
    };
  });

  // Sort by distance and return nearest
  locationsWithDistance.sort((a, b) => a.distance - b.distance);
  
  return locationsWithDistance[0];
};

/**
 * Get location by ID
 */
const getLocationById = async (locationId) => {
  let location = await withTimeout(
    WorkLocation.findOne({ locationId, isActive: true }).select('-__v').lean(),
    DB_TIMEOUT_MS,
    null
  );

  if (location) {
    return normalizePickerLocationFromWorkLocation(location);
  }

  const storeOr = [{ code: String(locationId || '').toUpperCase() }];
  if (mongoose.Types.ObjectId.isValid(locationId)) {
    storeOr.unshift({ _id: locationId });
  }
  const storeQuery = {
    $or: storeOr,
    type: { $in: ['warehouse', 'dark_store', 'store'] },
  };
  const store = await withTimeout(
    Store.findOne(storeQuery)
      .select(
        '_id code name type address city state pincode latitude longitude x y coordinatesCapturedAt coordinatesSource'
      )
      .lean(),
    DB_TIMEOUT_MS,
    null
  );

  if (store) {
    location = normalizePickerLocationFromStore(store);
  }

  if (!location) {
    throw new Error('Location not found');
  }

  return location;
};

/**
 * Validate if user is within geofence of a saved work location (darkstore).
 */
const validateLocation = async (locationId, userLatitude, userLongitude, radiusMeters) => {
  const location = await getLocationById(locationId);

  const lat = parseFloat(userLatitude);
  const lng = parseFloat(userLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('User coordinates are required');
  }

  const verificationCoords = resolveVerificationCoordinates(location);
  if (!verificationCoords) {
    throw new Error(
      'Dark store verification location is not configured. Re-select your darkstore on site.'
    );
  }

  const distanceMeters = calculateDistanceMeters(
    lat,
    lng,
    verificationCoords.latitude,
    verificationCoords.longitude
  );

  const parsedRadius = parseFloat(radiusMeters);
  const geofenceRadius =
    Number.isFinite(parsedRadius) && parsedRadius > 0
      ? parsedRadius
      : PICKER_SHIFT_GEOFENCE_M;
  const withinRange = distanceMeters <= geofenceRadius;

  return {
    valid: withinRange,
    withinRange,
    distance: Math.round((distanceMeters / 1000) * 10) / 10,
    distanceMeters: Math.round(distanceMeters),
    geofenceRadius,
    location: {
      id: location.locationId,
      name: location.name,
      type: location.type,
    },
  };
};

function parseGpsPayload(payload = {}) {
  const lat = parseFloat(payload.latitude);
  const lng = parseFloat(payload.longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error('Valid latitude between -90 and 90 is required');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('Valid longitude between -180 and 180 is required');
  }
  const capturedAt =
    payload.capturedAt != null ? new Date(payload.capturedAt) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    throw new Error('Invalid coordinates timestamp');
  }
  const address =
    typeof payload.address === 'string' && payload.address.trim()
      ? payload.address.trim()
      : null;
  return { latitude: lat, longitude: lng, address, capturedAt };
}

/**
 * Persist device GPS as the official darkstore coordinates (WorkLocation or Store).
 */
const persistDarkstoreGpsCoordinates = async (locationId, payload = {}) => {
  const { latitude, longitude, address, capturedAt } = parseGpsPayload(payload);
  const locKey = String(locationId || '').trim();
  if (!locKey) {
    throw new Error('Location ID is required');
  }

  const workUpdate = {
    'coordinates.latitude': latitude,
    'coordinates.longitude': longitude,
    'coordinates.capturedAt': capturedAt,
    'coordinates.source': 'device_gps',
  };
  if (address) {
    workUpdate.address = address;
  }

  const workLocation = await withTimeout(
    WorkLocation.findOneAndUpdate(
      { locationId: locKey, type: 'darkstore', isActive: true },
      { $set: workUpdate },
      { new: true, runValidators: true }
    )
      .select('locationId name address coordinates type')
      .lean(),
    DB_TIMEOUT_MS,
    null
  );

  if (workLocation) {
    return {
      success: true,
      storage: 'work_location',
      locationId: workLocation.locationId,
      name: workLocation.name,
      address: workLocation.address,
      latitude: workLocation.coordinates?.latitude ?? latitude,
      longitude: workLocation.coordinates?.longitude ?? longitude,
      capturedAt: workLocation.coordinates?.capturedAt ?? capturedAt,
    };
  }

  const storeOr = [{ code: locKey.toUpperCase() }];
  if (mongoose.Types.ObjectId.isValid(locKey)) {
    storeOr.unshift({ _id: locKey });
  }

  const storeUpdate = {
    latitude,
    longitude,
    x: latitude,
    y: longitude,
    coordinatesCapturedAt: capturedAt,
    coordinatesSource: 'device_gps',
  };
  if (address) {
    storeUpdate.address = address;
  }

  const store = await withTimeout(
    Store.findOneAndUpdate(
      {
        $or: storeOr,
        type: { $in: ['dark_store', 'store'] },
      },
      { $set: storeUpdate },
      { new: true, runValidators: true }
    )
      .select('_id code name address latitude longitude coordinatesCapturedAt')
      .lean(),
    DB_TIMEOUT_MS,
    null
  );

  if (!store) {
    throw new Error('Darkstore not found or is not active');
  }

  return {
    success: true,
    storage: 'store',
    locationId: String(store._id),
    name: store.name,
    address: store.address,
    latitude: store.latitude,
    longitude: store.longitude,
    capturedAt: store.coordinatesCapturedAt ?? capturedAt,
  };
};

/**
 * Set user's work location
 */
const setUserLocation = async (userId, locationId, locationType, gpsPayload) => {
  // Verify location exists and is active
  const location = await getLocationById(locationId);

  // Verify location type matches
  if (location.type !== locationType) {
    throw new Error(`Location type mismatch. Expected ${locationType}, got ${location.type}`);
  }

  let savedGps = null;
  if (locationType === 'darkstore' && gpsPayload?.latitude != null && gpsPayload?.longitude != null) {
    savedGps = await persistDarkstoreGpsCoordinates(locationId, gpsPayload);
  }

  // Update user's location
  const user = await withTimeout(
    User.findByIdAndUpdate(
      userId,
      {
        currentLocationId: locationId,
        locationType: locationType
      },
      { new: true, runValidators: true }
    ).select('currentLocationId locationType name'),
    DB_TIMEOUT_MS
  );

  if (!user) {
    throw new Error('Failed to update user location');
  }

  return {
    success: true,
    user: {
      id: user._id,
      name: user.name,
      currentLocationId: user.currentLocationId,
      locationType: user.locationType
    },
    location: {
      id: location.locationId,
      name: location.name,
      type: location.type,
      address: location.address,
      latitude: savedGps?.latitude ?? location.coordinates?.latitude ?? null,
      longitude: savedGps?.longitude ?? location.coordinates?.longitude ?? null,
      coordinatesCapturedAt: savedGps?.capturedAt ?? null,
    },
    savedGps,
  };
};

/**
 * Get current work location for a picker user (hubName, hubId, address).
 * Used by Picker app get-started and home screens.
 */
const getCurrentLocationForUser = async (userId) => {
  const user = await User.findById(userId).select('currentLocationId locationType').lean();
  if (!user || !user.currentLocationId) {
    return { hubId: null, hubName: null, address: null, locationType: user?.locationType || null };
  }
  const location = await getLocationById(user.currentLocationId).catch(() => null);
  if (!location) {
    return {
      hubId: user.currentLocationId,
      hubName: user.currentLocationId,
      address: null,
      locationType: user.locationType,
    };
  }
  const verificationCoords = resolveVerificationCoordinates(location);
  return {
    hubId: location.locationId,
    hubName: location.name,
    address: location.address,
    locationType: user.locationType,
    latitude: verificationCoords?.latitude ?? null,
    longitude: verificationCoords?.longitude ?? null,
    coordinatesCapturedAt: verificationCoords?.capturedAt ?? null,
    coordinatesSource: verificationCoords?.source ?? null,
  };
};

/**
 * Ensure the assigned darkstore has device GPS saved as the verification anchor.
 * Updates admin/legacy coordinates when they are missing or far from the picker.
 */
const ensureDarkstoreVerificationAnchor = async (userId, deviceGps = {}) => {
  const user = await User.findById(userId).select('currentLocationId locationType').lean();
  if (!user?.currentLocationId) {
    throw new Error('No darkstore assigned. Select your work location first.');
  }
  if (user.locationType !== 'darkstore') {
    throw new Error('Location verification applies to darkstore assignments only.');
  }

  const locationId = String(user.currentLocationId);
  const location = await getLocationById(locationId);
  const existing = resolveVerificationCoordinates(location);
  const { latitude: deviceLat, longitude: deviceLng } = parseGpsPayload(deviceGps);

  const CORRUPT_COORDS_THRESHOLD_M = 1000;

  let needsAnchor = !existing;
  if (existing && existing.source !== 'device_gps') {
    const distM = calculateDistanceMeters(
      deviceLat,
      deviceLng,
      existing.latitude,
      existing.longitude
    );
    if (distM > CORRUPT_COORDS_THRESHOLD_M) {
      needsAnchor = true;
    }
  }

  if (!needsAnchor) {
    return {
      anchored: false,
      locationId,
      name: location.name,
      address: location.address,
      verification: existing,
    };
  }

  const saved = await persistDarkstoreGpsCoordinates(locationId, deviceGps);
  return {
    anchored: true,
    locationId: saved.locationId,
    name: saved.name,
    address: saved.address,
    verification: {
      latitude: saved.latitude,
      longitude: saved.longitude,
      source: 'device_gps',
      capturedAt: saved.capturedAt,
    },
  };
};

/**
 * Resolve nearest darkstore from GPS and persist as the picker's work location.
 */
const setDarkstoreFromCurrentLocation = async (userId, latitude, longitude, options = {}) => {
  const { latitude: lat, longitude: lng, address, capturedAt } = parseGpsPayload({
    latitude,
    longitude,
    address: options.address,
    capturedAt: options.capturedAt,
  });

  const nearest = await getNearestDarkstoreLocation(lat, lng);
  const savedGps = await persistDarkstoreGpsCoordinates(nearest.locationId, {
    latitude: lat,
    longitude: lng,
    address,
    capturedAt,
  });
  await updateUserLastLocation(userId, lat, lng);
  const assignment = await setUserLocation(userId, nearest.locationId, 'darkstore');

  return {
    ...assignment,
    savedGps,
    nearest: {
      locationId: nearest.locationId,
      name: nearest.name,
      type: nearest.type,
      address: savedGps.address ?? nearest.address,
      city: nearest.city,
      state: nearest.state,
      coordinates: {
        latitude: savedGps.latitude,
        longitude: savedGps.longitude,
      },
      distance: nearest.distance,
      distanceDisplay: nearest.distanceDisplay,
      travelTime: nearest.travelTime,
    },
    coordinates: { latitude: lat, longitude: lng, capturedAt: savedGps.capturedAt },
  };
};

/**
 * Update user's last known location (for tracking)
 */
const updateUserLastLocation = async (userId, latitude, longitude) => {
  const user = await withTimeout(
    User.findByIdAndUpdate(
      userId,
      {
        lastKnownLocation: {
          latitude,
          longitude,
          timestamp: new Date()
        }
      },
      { new: true }
    ).select('name lastKnownLocation'),
    DB_TIMEOUT_MS
  );

  if (!user) {
    throw new Error('User not found');
  }

  return {
    success: true,
    location: user.lastKnownLocation
  };
};

module.exports = {
  getAllLocations,
  getNearestLocation,
  getNearestDarkstoreLocation,
  getLocationById,
  getCurrentLocationForUser,
  validateLocation,
  ensureDarkstoreVerificationAnchor,
  resolveVerificationCoordinates,
  persistDarkstoreGpsCoordinates,
  setUserLocation,
  setDarkstoreFromCurrentLocation,
  updateUserLastLocation,
  calculateDistance,
  estimateTravelTime,
};
