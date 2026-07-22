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

/** Remove resize query params that break static CloudFront asset URLs. */
function cleanClientImageUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    const path = u.pathname.toLowerCase();
    const isStaticAsset = /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(path);
    const isCdnHost =
      u.hostname.includes('cloudfront.net') ||
      u.hostname.includes('amazonaws.com') ||
      path.includes('/prod/products/');
    if (isStaticAsset || isCdnHost) {
      u.searchParams.delete('q');
      u.searchParams.delete('w');
      const qs = u.searchParams.toString();
      u.search = qs ? `?${qs}` : '';
      return u.toString().replace(/\?$/, '');
    }
    return u.toString();
  } catch {
    return trimmed
      .replace(/([?&])q=\d*(&|$)/gi, '$2')
      .replace(/([?&])w=\d*(&|$)/gi, '$2')
      .replace(/\?&/, '?')
      .replace(/[?&]$/, '');
  }
}

function sanitizeImageFields(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };
  for (const key of ['thumbnailUrl', 'cardImageUrl', 'imageUrl', 'bannerImageUrl']) {
    if (isStubImageUrl(out[key])) {
      out[key] = '';
    } else if (typeof out[key] === 'string' && out[key].trim()) {
      out[key] = cleanClientImageUrl(out[key]);
    }
  }
  if (Array.isArray(out.images)) {
    out.images = out.images
      .filter((u) => typeof u === 'string' && u.trim() && !isStubImageUrl(u))
      .map((u) => cleanClientImageUrl(u));
  }
  return out;
}

module.exports = {
  isStubImageUrl,
  pickFirstNonStubString,
  sanitizeImageFields,
};
