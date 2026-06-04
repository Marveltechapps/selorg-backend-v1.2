"use strict";

/**
 * Ensures Rider V2 orders include map coordinates for travel/navigation screens.
 * Pickup: Store model by darkstoreCode. Drop: existing delivery.address.coordinates or geocode.
 */

function isValidCoord(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

async function lookupStoreCoordinates(darkstoreCode) {
  const storeCode = String(darkstoreCode || "").trim();
  if (!storeCode) return null;
  try {
    const Store = require("../../../../merch/models/Store");
    const escaped = storeCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const store = await Store.findOne({
      $or: [{ code: storeCode }, { storeId: storeCode }, { name: new RegExp(escaped, "i") }],
    })
      .select("latitude longitude address city")
      .lean();
    const lat = store && store.latitude;
    const lng = store && store.longitude;
    if (isValidCoord(lat, lng)) {
      return { lat, lng, address: store.address || store.city || storeCode };
    }
  } catch (err) {
    console.warn("[orderMapEnrichment] Store lookup failed:", err.message);
  }
  return null;
}

/**
 * Mutates order plain object for API responses; persists pickup coords when missing on a Mongoose doc.
 */
async function ensureOrderMapMetadata(order) {
  if (!order) return order;
  const isMongoose = typeof order.toObject === "function";
  const plain = isMongoose ? order.toObject() : order;
  plain.metadata = plain.metadata || {};

  const hasPickup = isValidCoord(
    plain.metadata.pickupCoordinates && plain.metadata.pickupCoordinates.lat,
    plain.metadata.pickupCoordinates && plain.metadata.pickupCoordinates.lng
  );

  if (!hasPickup) {
    const code = plain.darkstoreCode || plain.warehouseCode;
    const storeCoords = await lookupStoreCoordinates(code);
    if (storeCoords) {
      plain.metadata.pickupCoordinates = { lat: storeCoords.lat, lng: storeCoords.lng };
      if (!plain.metadata.pickupAddress) {
        plain.metadata.pickupAddress = storeCoords.address || code;
      }
      if (isMongoose) {
        order.metadata = order.metadata || {};
        order.metadata.pickupCoordinates = plain.metadata.pickupCoordinates;
        order.metadata.pickupAddress = plain.metadata.pickupAddress;
        order.markModified("metadata");
        await order.save().catch(function (err) {
          console.warn("[orderMapEnrichment] persist pickup coords failed:", err.message);
        });
      }
    }
  }

  return plain;
}

module.exports = { ensureOrderMapMetadata, lookupStoreCoordinates };
