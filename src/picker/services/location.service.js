/**
 * Location Service
 * Handles work location operations, distance calculations, and geofencing
 */
const WorkLocation = require('../models/workLocation.model');
const User = require('../models/user.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
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
  const locations = await withTimeout(
    WorkLocation.find({ isActive: true })
      .select('-__v')
      .sort({ name: 1 })
      .lean(),
    DB_TIMEOUT_MS
  );

  if (!locations) {
    throw new Error('Failed to fetch locations');
  }

  // If coordinates provided, calculate distances and filter by radius
  if (latitude && longitude) {
    const locationsWithDistance = locations.map(location => {
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
    return locationsWithDistance
      .filter(loc => loc.withinRadius)
      .sort((a, b) => a.distance - b.distance);
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
 * Get nearest work location to user
 */
const getNearestLocation = async (latitude, longitude) => {
  if (!latitude || !longitude) {
    throw new Error('Latitude and longitude are required');
  }

  const locations = await withTimeout(
    WorkLocation.find({ isActive: true })
      .select('-__v')
      .lean(),
    DB_TIMEOUT_MS
  );

  if (!locations || locations.length === 0) {
    throw new Error('No active locations found');
  }

  // Calculate distances for all locations
  const locationsWithDistance = locations.map(location => {
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
  const location = await withTimeout(
    WorkLocation.findOne({ locationId, isActive: true })
      .select('-__v')
      .lean(),
    DB_TIMEOUT_MS
  );

  if (!location) {
    throw new Error('Location not found');
  }

  return location;
};

/**
 * Validate if user is within geofence of location
 */
const validateLocation = async (locationId, userLatitude, userLongitude) => {
  const location = await getLocationById(locationId);
  
  if (!userLatitude || !userLongitude) {
    throw new Error('User coordinates are required');
  }

  const distance = calculateDistance(
    userLatitude,
    userLongitude,
    location.coordinates.latitude,
    location.coordinates.longitude
  );

  const distanceMeters = distance * 1000;
  const geofenceRadius = location.geofence?.radius || 500;
  const withinRange = distanceMeters <= geofenceRadius;

  return {
    valid: withinRange,
    withinRange,
    distance,
    distanceMeters: Math.round(distanceMeters),
    geofenceRadius,
    location: {
      id: location.locationId,
      name: location.name,
      type: location.type
    }
  };
};

/**
 * Set user's work location
 */
const setUserLocation = async (userId, locationId, locationType) => {
  // Verify location exists and is active
  const location = await getLocationById(locationId);

  // Verify location type matches
  if (location.type !== locationType) {
    throw new Error(`Location type mismatch. Expected ${locationType}, got ${location.type}`);
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
      address: location.address
    }
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
  getLocationById,
  validateLocation,
  setUserLocation,
  updateUserLastLocation,
  calculateDistance,
  estimateTravelTime
};
