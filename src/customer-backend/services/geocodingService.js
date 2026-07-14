/**
 * Google Maps Geocoding service.
 * Uses Geocoding API to convert addresses to lat/lng and reverse geocode lat/lng to addresses.
 * API key: Integration (google_maps) or process.env.GOOGLE_MAPS_API_KEY
 */
const Integration = require('../../admin/models/Integration');

const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_AUTOCOMPLETE_BASE = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const GEOLOCATE_BASE = 'https://www.googleapis.com/geolocation/v1/geolocate';

async function getGoogleMapsApiKey() {
  try {
    const integ = await Integration.findOne({ service: 'google_maps', isActive: true });
    const key = integ?.apiKey?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim();
    return key || null;
  } catch (err) {
    console.warn('Geocoding: failed to load API key from database', err.message);
    return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
  }
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

async function searchAddressSuggestions(query, options = {}) {
  if (!query || typeof query !== 'string') return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const key = await getGoogleMapsApiKey();
  if (!key) {
    const geo = await geocodeAddress(trimmed);
    if (!geo) return [];
    const name = geo.line2 || geo.city || trimmed.split(',')[0].trim();
    const addr = [geo.line1, geo.line2, geo.city, geo.state, geo.pincode].filter(Boolean).join(', ');
    return [{ name, addr, latitude: geo.latitude, longitude: geo.longitude }];
  }

  try {
    const url = new URL(PLACES_AUTOCOMPLETE_BASE);
    url.searchParams.set('input', trimmed);
    url.searchParams.set('key', key);
    url.searchParams.set('components', 'country:in');
    url.searchParams.set('types', 'geocode|establishment');

    const { latitude, longitude } = options;
    if (latitude != null && longitude != null && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude))) {
      url.searchParams.set('location', `${latitude},${longitude}`);
      url.searchParams.set('radius', '50000');
    }

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== 'OK' || !Array.isArray(data.predictions)) {
      if (data.status === 'ZERO_RESULTS') return [];
      const geo = await geocodeAddress(trimmed);
      if (!geo) return [];
      const name = geo.line2 || geo.city || trimmed.split(',')[0].trim();
      const addr = [geo.line1, geo.line2, geo.city, geo.state, geo.pincode].filter(Boolean).join(', ');
      return [{ name, addr, latitude: geo.latitude, longitude: geo.longitude }];
    }

    return data.predictions.slice(0, 8).map((p) => ({
      name: p.structured_formatting?.main_text || p.description || trimmed,
      addr: p.structured_formatting?.secondary_text || p.description || '',
      placeId: p.place_id,
    }));
  } catch (err) {
    console.error('Places autocomplete error:', err.message);
    return [];
  }
}

/**
 * Approximate device location from IP/network when browser GPS is unavailable.
 * Uses Google Geolocation API (enable "Geolocation API" in Google Cloud).
 * @returns {Promise<{ latitude: number, longitude: number, accuracy?: number } | null>}
 */
async function getApproximateLocation() {
  const key = await getGoogleMapsApiKey();
  if (!key) {
    console.warn('Approximate location: No Google Maps API key configured');
    return null;
  }

  try {
    const url = `${GEOLOCATE_BASE}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ considerIp: true }),
    });
    const data = await res.json();

    if (data.error) {
      console.warn('Approximate location API error:', data.error.message || data.error);
      return null;
    }

    const lat = data.location?.lat;
    const lng = data.location?.lng;
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return null;
    }

    return {
      latitude: Number(lat),
      longitude: Number(lng),
      accuracy: data.accuracy != null ? Number(data.accuracy) : undefined,
    };
  } catch (err) {
    console.error('Approximate location error:', err.message);
    return null;
  }
}

module.exports = {
  geocodeAddress,
  reverseGeocode,
  searchAddressSuggestions,
  getApproximateLocation,
  getGoogleMapsApiKey,
};
