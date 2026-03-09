/**
 * Google Maps Geocoding service.
 * Uses Geocoding API to convert addresses to lat/lng and reverse geocode lat/lng to addresses.
 * API key: Integration (google_maps) or process.env.GOOGLE_MAPS_API_KEY
 */
const Integration = require('../../admin/models/Integration');

const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

async function getGoogleMapsApiKey() {
  const integ = await Integration.findOne({ service: 'google_maps', isActive: true });
  const key = integ?.apiKey?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

/**
 * Extract address components from Google Geocoding API result.
 */
function parseAddressComponents(components) {
  let line1 = '';
  let line2 = '';
  let city = '';
  let state = '';
  let pincode = '';

  const streetNumber = components.find((c) => c.types.includes('street_number'))?.long_name || '';
  const route = components.find((c) => c.types.includes('route'))?.long_name || '';
  const sublocality = components.find((c) =>
    c.types.some((t) => ['sublocality', 'sublocality_level_1', 'neighborhood'].includes(t))
  )?.long_name || '';
  const locality = components.find((c) => c.types.includes('locality'))?.long_name || '';
  const admin1 = components.find((c) =>
    c.types.some((t) => ['administrative_area_level_1', 'administrative_area_level_2'].includes(t))
  )?.long_name || '';
  const postalCode = components.find((c) => c.types.includes('postal_code'))?.long_name || '';

  if (streetNumber || route) {
    line1 = [streetNumber, route].filter(Boolean).join(' ');
  }
  if (sublocality) {
    line2 = sublocality;
  }
  city = locality || sublocality || admin1 || '';
  state = admin1 || '';
  pincode = postalCode || '';

  return { line1, line2, city, state, pincode };
}

/**
 * Geocode an address string to lat, lng and structured address.
 * @param {string} address - Full address string
 * @returns {Promise<{ latitude: number, longitude: number, line1: string, line2: string, city: string, state: string, pincode: string } | null>}
 */
async function geocodeAddress(address) {
  if (!address || typeof address !== 'string') return null;
  const trimmed = address.trim();
  if (!trimmed) return null;

  const key = await getGoogleMapsApiKey();
  if (!key) {
    console.warn('Geocoding: No Google Maps API key configured');
    return null;
  }

  try {
    const url = new URL(GEOCODE_BASE);
    url.searchParams.set('address', trimmed);
    url.searchParams.set('key', key);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return null;
    }

    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    const parsed = parseAddressComponents(result.address_components || []);

    return {
      latitude: lat,
      longitude: lng,
      line1: parsed.line1 || result.formatted_address || trimmed,
      line2: parsed.line2,
      city: parsed.city,
      state: parsed.state,
      pincode: parsed.pincode,
    };
  } catch (err) {
    console.error('Geocoding API error:', err.message);
    return null;
  }
}

/**
 * Reverse geocode lat/lng to exact address.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{ line1: string, line2: string, city: string, state: string, pincode: string } | null>}
 */
async function reverseGeocode(latitude, longitude) {
  if (latitude == null || longitude == null || Number.isNaN(Number(latitude)) || Number.isNaN(Number(longitude))) {
    return null;
  }

  const key = await getGoogleMapsApiKey();
  if (!key) {
    console.warn('Reverse geocoding: No Google Maps API key configured');
    return null;
  }

  try {
    const url = new URL(GEOCODE_BASE);
    url.searchParams.set('latlng', `${latitude},${longitude}`);
    url.searchParams.set('key', key);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return null;
    }

    const result = data.results[0];
    const parsed = parseAddressComponents(result.address_components || []);

    return {
      line1: parsed.line1 || result.formatted_address || '',
      line2: parsed.line2,
      city: parsed.city,
      state: parsed.state,
      pincode: parsed.pincode,
    };
  } catch (err) {
    console.error('Reverse geocoding API error:', err.message);
    return null;
  }
}

module.exports = {
  geocodeAddress,
  reverseGeocode,
  getGoogleMapsApiKey,
};
