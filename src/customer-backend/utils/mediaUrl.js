/**
 * Stub / placeholder image hosts (seed data, not real CDN assets).
 * Mobile clients cannot load many of these reliably (TLS, 403, etc.).
 */

function isStubImageUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('local://')) return true;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return (
      host === 'placehold.co' ||
      host.endsWith('.placehold.co') ||
      host === 'via.placeholder.com' ||
      host === 'placeholder.com' ||
      host.endsWith('.placeholder.com')
    );
  } catch {
    return /placehold\.co|via\.placeholder\.com|placeholder\.com/i.test(trimmed);
  }
}

function pickFirstNonStubString(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() && !isStubImageUrl(v)) return v.trim();
  }
  return '';
}

function sanitizeImageFields(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };
  for (const key of ['thumbnailUrl', 'cardImageUrl', 'imageUrl', 'bannerImageUrl']) {
    if (isStubImageUrl(out[key])) out[key] = '';
  }
  if (Array.isArray(out.images)) {
    out.images = out.images.filter((u) => typeof u === 'string' && u.trim() && !isStubImageUrl(u));
  }
  return out;
}

module.exports = {
  isStubImageUrl,
  pickFirstNonStubString,
  sanitizeImageFields,
};
