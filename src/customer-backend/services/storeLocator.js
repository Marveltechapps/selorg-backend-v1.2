const Store = require('../../merch/models/Store');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest active darkstore to the given coordinates.
 * 1. Prefers the closest store whose deliveryRadius covers the customer.
 * 2. Falls back to the absolute nearest store if none covers the customer.
 */
async function findNearestDarkstore(latitude, longitude) {
  if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
    return null;
  }

  const darkstores = await Store.find(
    { type: 'dark_store', status: 'active' },
    { code: 1, latitude: 1, longitude: 1, deliveryRadius: 1 }
  ).lean();

  let bestInRadius = null;
  let bestInRadiusDist = Infinity;
  let absoluteNearest = null;
  let absoluteNearestDist = Infinity;

  for (const ds of darkstores) {
    if (ds.latitude == null || ds.longitude == null) continue;
    const dist = haversineKm(latitude, longitude, ds.latitude, ds.longitude);

    if (dist < absoluteNearestDist) {
      absoluteNearestDist = dist;
      absoluteNearest = ds.code;
    }

    const radius = ds.deliveryRadius || 5;
    if (dist <= radius && dist < bestInRadiusDist) {
      bestInRadiusDist = dist;
      bestInRadius = ds.code;
    }
  }

  return bestInRadius || absoluteNearest;
}

/**
 * Resolve a Store document _id from its code.
 * Used to populate storeId on customer orders.
 */
async function resolveStoreId(code) {
  if (!code) return null;
  const store = await Store.findOne({ code }, { _id: 1 }).lean();
  return store ? store._id : null;
}

module.exports = { findNearestDarkstore, resolveStoreId, haversineKm };
