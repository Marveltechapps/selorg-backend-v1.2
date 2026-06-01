const mongoose = require('mongoose');
const { CustomerAddress } = require('../models/CustomerAddress');
const { geocodeAddress, reverseGeocode } = require('./geocodingService');

/**
 * Enrich address data using Google Maps Geocoding API.
 * - If lat/lng provided but address incomplete → reverse geocode
 * - If address provided but no lat/lng → geocode
 */
async function enrichWithGeocoding(body) {
  const { line1, line2, city, state, pincode, latitude, longitude, address: addressField } = body;
  const hasLatLng = latitude != null && longitude != null && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude));
  const hasAddress = [line1, city, addressField].some((v) => v && String(v).trim());
  const addressStr = addressField?.trim()
    || [line1, line2, city, state, pincode].filter(Boolean).map(String).join(', ');

  if (hasLatLng && !hasAddress) {
    const geo = await reverseGeocode(Number(latitude), Number(longitude));
    if (geo) {
      return {
        line1: geo.line1,
        line2: geo.line2 || '',
        city: geo.city || '',
        state: geo.state || '',
        pincode: geo.pincode || '',
        latitude: Number(latitude),
        longitude: Number(longitude),
      };
    }
  }

  if (hasAddress && !hasLatLng && addressStr.trim()) {
    const geo = await geocodeAddress(addressStr);
    if (geo) {
      return {
        line1: geo.line1 || line1 || '',
        line2: geo.line2 || line2 || '',
        city: geo.city || city || '',
        state: geo.state || state || '',
        pincode: geo.pincode || pincode || '',
        latitude: geo.latitude,
        longitude: geo.longitude,
      };
    }
  }

  if (hasLatLng && hasAddress) {
    const geo = await reverseGeocode(Number(latitude), Number(longitude));
    if (geo) {
      return {
        line1: geo.line1 || line1 || '',
        line2: geo.line2 || line2 || '',
        city: geo.city || city || '',
        state: geo.state || state || '',
        pincode: geo.pincode || pincode || '',
        latitude: Number(latitude),
        longitude: Number(longitude),
      };
    }
  }

  return null;
}

function toAddressDto(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    ...o,
    _id: String(o._id),
    landmark: o.landmark || '',
    line2: o.line2 || '',
  };
}

/**
 * List all addresses for a user, ordered by order then createdAt.
 */
async function getAddressesByUserId(userId) {
  const addresses = await CustomerAddress.find({ userId })
    .sort({ order: 1, createdAt: 1 })
    .lean();
  return addresses.map((a) => ({ ...a, _id: String(a._id), landmark: a.landmark || '' }));
}

/**
 * Get the default address for a user (isDefault: true), or the first address if none marked default.
 */
async function getDefaultAddress(userId) {
  let address = await CustomerAddress.findOne({ userId, isDefault: true }).lean();
  if (!address) {
    address = await CustomerAddress.findOne({ userId }).sort({ order: 1, createdAt: 1 }).lean();
  }
  return address ? { ...address, _id: String(address._id), landmark: address.landmark || '' } : null;
}

/**
 * Create a new address for a user (always inserts a new document).
 */
async function createAddress(userId, body) {
  const enriched = await enrichWithGeocoding(body);
  const merged = enriched ? { ...body, ...enriched } : body;

  const {
    label,
    line1,
    line2,
    landmark,
    city,
    state,
    pincode,
    latitude,
    longitude,
    isDefault,
  } = merged;

  if (!line1 || !String(line1).trim()) {
    return { error: 'VALIDATION', message: 'Address line 1 is required' };
  }
  if (!city || !String(city).trim()) {
    return { error: 'VALIDATION', message: 'City is required' };
  }

  const normalizedLabel = (label || 'Home').trim();
  const count = await CustomerAddress.countDocuments({ userId });

  const doc = await CustomerAddress.create({
    userId: new mongoose.Types.ObjectId(userId),
    label: normalizedLabel,
    line1: String(line1).trim(),
    line2: String(line2 || '').trim(),
    landmark: String(landmark || '').trim(),
    city: String(city).trim(),
    state: String(state || '').trim(),
    pincode: String(pincode || '').trim(),
    latitude,
    longitude,
    isDefault: Boolean(isDefault),
    order: count,
  });

  if (isDefault) {
    await CustomerAddress.updateMany(
      { userId, _id: { $ne: doc._id } },
      { $set: { isDefault: false } }
    );
  }

  return { address: toAddressDto(doc), wasUpdated: false };
}

/**
 * Update an address. Only the owning user can update.
 */
async function updateAddress(userId, addressId, body) {
  if (!mongoose.Types.ObjectId.isValid(addressId)) return null;
  const address = await CustomerAddress.findOne({ _id: addressId, userId });
  if (!address) return null;

  const mergeBody = {
    ...address.toObject(),
    ...body,
  };
  const enriched = await enrichWithGeocoding(mergeBody);
  const merged = enriched ? { ...body, ...enriched } : body;

  const { label, line1, line2, landmark, city, state, pincode, latitude, longitude, isDefault } = merged;
  if (label !== undefined) address.label = String(label).trim() || address.label;
  if (line1 !== undefined) address.line1 = String(line1).trim();
  if (line2 !== undefined) address.line2 = String(line2 || '').trim();
  if (landmark !== undefined) address.landmark = String(landmark || '').trim();
  if (city !== undefined) address.city = String(city).trim();
  if (state !== undefined) address.state = String(state || '').trim();
  if (pincode !== undefined) address.pincode = String(pincode || '').trim();
  if (latitude !== undefined) address.latitude = latitude;
  if (longitude !== undefined) address.longitude = longitude;
  if (isDefault !== undefined) {
    address.isDefault = Boolean(isDefault);
    if (address.isDefault) {
      await CustomerAddress.updateMany(
        { userId, _id: { $ne: addressId } },
        { $set: { isDefault: false } }
      );
    }
  }
  await address.save();
  return toAddressDto(address);
}

/**
 * Delete an address. Only the owning user can delete.
 */
async function deleteAddress(userId, addressId) {
  if (!mongoose.Types.ObjectId.isValid(addressId)) return null;
  const result = await CustomerAddress.findOneAndDelete({ _id: addressId, userId });
  return result;
}

/**
 * Set an address as default. Only the owning user.
 */
async function setDefaultAddress(userId, addressId) {
  if (!mongoose.Types.ObjectId.isValid(addressId)) return null;
  const address = await CustomerAddress.findOne({ _id: addressId, userId });
  if (!address) return null;
  await CustomerAddress.updateMany({ userId }, { $set: { isDefault: false } });
  address.isDefault = true;
  await address.save();
  return toAddressDto(address);
}

module.exports = {
  getAddressesByUserId,
  getDefaultAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};
