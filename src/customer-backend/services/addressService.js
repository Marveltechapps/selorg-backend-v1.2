const mongoose = require('mongoose');
const { CustomerAddress } = require('../models/CustomerAddress');
const { geocodeAddress, reverseGeocode } = require('./geocodingService');

function toUserObjectId(userId) {
  if (!userId) {
    const err = new Error('Invalid user id');
    err.statusCode = 401;
    throw err;
  }
  if (userId instanceof mongoose.Types.ObjectId) return userId;
  if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
    return new mongoose.Types.ObjectId(userId);
  }
  const err = new Error('Invalid user id');
  err.statusCode = 401;
  throw err;
}

function escapeLabelRegex(label) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAddressFields(fields) {
  const line1 = (fields.line1 != null ? String(fields.line1) : '').trim();
  const city = (fields.city != null ? String(fields.city) : '').trim();
  return {
    ...fields,
    line1: line1 || 'Address',
    city: city || 'Unknown',
  };
}

/** Merge geocoding results but keep the user's house/floor in line1. */
function mergeWithEnrichment(body, enriched) {
  if (!enriched) return normalizeAddressFields(body);
  const userLine1 = (body.line1 != null ? String(body.line1) : '').trim();
  const merged = normalizeAddressFields({ ...body, ...enriched });
  if (userLine1) {
    merged.line1 = userLine1;
    const geoStreet = (enriched.line1 != null ? String(enriched.line1) : '').trim();
    if (geoStreet && geoStreet !== userLine1) {
      const parts = [merged.line2, geoStreet]
        .map((s) => (s != null ? String(s) : '').trim())
        .filter(Boolean);
      merged.line2 = parts.join(', ');
    }
  }
  return merged;
}

async function applyExistingAddressUpdate(existing, fields, userObjectId) {
  const { label, line1, line2, landmark, city, state, pincode, latitude, longitude, isDefault } = fields;
  if (label !== undefined) existing.label = String(label).trim() || existing.label;
  if (line1 !== undefined) existing.line1 = line1;
  if (line2 !== undefined) existing.line2 = line2;
  if (landmark !== undefined) existing.landmark = landmark;
  if (city !== undefined) existing.city = city;
  if (state !== undefined) existing.state = state;
  if (pincode !== undefined) existing.pincode = pincode;
  if (latitude !== undefined) existing.latitude = latitude;
  if (longitude !== undefined) existing.longitude = longitude;
  if (isDefault !== undefined) {
    existing.isDefault = Boolean(isDefault);
    if (existing.isDefault) {
      await CustomerAddress.updateMany(
        { userId: userObjectId, _id: { $ne: existing._id } },
        { $set: { isDefault: false } }
      );
    }
  }
  await existing.save();
  return existing.toObject ? existing.toObject() : existing;
}

/**
 * Enrich address data using Google Maps Geocoding API.
 * - If lat/lng provided but address incomplete → reverse geocode
 * - If address provided but no lat/lng → geocode
 */
async function enrichWithGeocoding(body) {
  const { line1, line2, landmark, city, state, pincode, latitude, longitude, address: addressField } = body;
  const hasLatLng = latitude != null && longitude != null && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude));
  const hasAddress = [line1, city, addressField].some((v) => v && String(v).trim());
  const addressStr = addressField?.trim()
    || [line1, line2, landmark, city, state, pincode].filter(Boolean).map(String).join(', ');

  if (hasLatLng && !hasAddress) {
    const geo = await reverseGeocode(Number(latitude), Number(longitude));
    if (geo) {
      return {
        line1: geo.line1,
        line2: geo.line2 || '',
        landmark: geo.landmark || '',
        city: geo.city || city || '',
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
        landmark: geo.landmark || landmark || '',
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
        landmark: geo.landmark || landmark || '',
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
  const uid = toUserObjectId(userId);
  const addresses = await CustomerAddress.find({ userId: uid })
    .sort({ order: 1, createdAt: 1 })
    .lean();
  return addresses.map((a) => ({ ...a, _id: String(a._id), landmark: a.landmark || '' }));
}

/**
 * Get the default address for a user (isDefault: true), or the first address if none marked default.
 */
async function getDefaultAddress(userId) {
  const uid = toUserObjectId(userId);
  let address = await CustomerAddress.findOne({ userId: uid, isDefault: true }).lean();
  if (!address) {
    address = await CustomerAddress.findOne({ userId: uid }).sort({ order: 1, createdAt: 1 }).lean();
  }
  return address ? { ...address, _id: String(address._id), landmark: address.landmark || '' } : null;
}

/**
 * Create a new address for a user (always inserts a new document).
 */
async function createAddress(userId, body) {
  const uid = toUserObjectId(userId);
  const enriched = await enrichWithGeocoding(body);
  const merged = mergeWithEnrichment(body, enriched);

  const { label, line1, line2, landmark, city, state, pincode, latitude, longitude, isDefault } = merged;

  if (!line1 || !String(line1).trim()) {
    return { error: 'VALIDATION', message: 'Address line 1 is required' };
  }
  if (!city || !String(city).trim()) {
    return { error: 'VALIDATION', message: 'City is required' };
  }

  const normalizedLabel = (label || 'Home').trim();

  const existing = await CustomerAddress.findOne({
    userId: uid,
    label: { $regex: new RegExp(`^${escapeLabelRegex(normalizedLabel)}$`, 'i') },
  });

  if (existing) {
    const result = await applyExistingAddressUpdate(existing, merged, uid);
    return { address: toAddressDto(result), wasUpdated: true };
  }

  const count = await CustomerAddress.countDocuments({ userId: uid });
  const createPayload = {
    userId: uid,
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
  };

  let doc;
  try {
    doc = await CustomerAddress.create(createPayload);
  } catch (err) {
    if (err.code === 11000) {
      const duplicate = await CustomerAddress.findOne({
        userId: uid,
        label: { $regex: new RegExp(`^${escapeLabelRegex(normalizedLabel)}$`, 'i') },
      });
      if (duplicate) {
        const result = await applyExistingAddressUpdate(duplicate, merged, uid);
        return { address: toAddressDto(result), wasUpdated: true };
      }
    }
    throw err;
  }

  if (isDefault) {
    await CustomerAddress.updateMany(
      { userId: uid, _id: { $ne: doc._id } },
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
  const uid = toUserObjectId(userId);
  const address = await CustomerAddress.findOne({ _id: addressId, userId: uid });
  if (!address) return null;

  const mergeBody = {
    ...address.toObject(),
    ...body,
  };
  // Edits: apply user fields directly — do not reverse-geocode over typed line1/city.
  const merged = normalizeAddressFields(mergeBody);

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
        { userId: uid, _id: { $ne: addressId } },
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
  const uid = toUserObjectId(userId);
  const result = await CustomerAddress.findOneAndDelete({ _id: addressId, userId: uid });
  return result;
}

/**
 * Set an address as default. Only the owning user.
 */
async function setDefaultAddress(userId, addressId) {
  if (!mongoose.Types.ObjectId.isValid(addressId)) return null;
  const uid = toUserObjectId(userId);
  const address = await CustomerAddress.findOne({ _id: addressId, userId: uid });
  if (!address) return null;
  await CustomerAddress.updateMany({ userId: uid }, { $set: { isDefault: false } });
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
