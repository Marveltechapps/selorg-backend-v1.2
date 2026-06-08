/**
 * Normalize stored media URLs for API responses (picker docs, profile images, etc.).
 * Converts relative `/uploads/...` paths to absolute URLs using API_BASE_URL / BASE_URL.
 */
function getApiOrigin() {
  const raw = (
    process.env.API_BASE_URL ||
    process.env.BASE_URL ||
    `http://localhost:${process.env.PORT || 3333}`
  ).trim();
  if (!raw) return `http://localhost:${process.env.PORT || 3333}`;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const parsed = new URL(withProtocol);
    return parsed.origin;
  } catch {
    return raw.replace(/\/api\/v1.*$/i, '').replace(/\/$/, '');
  }
}

function resolveMediaUrl(input) {
  if (input == null) return null;
  let url = typeof input === 'string' ? input.trim() : '';
  if (!url) return null;

  if (url.startsWith('data:')) return url;

  if (/^https?:\/(?!\/)/i.test(url)) {
    url = url.replace(/^https?:\/(?!\/)/i, (m) => `${m}/`);
  }
  if (/^www\./i.test(url)) {
    url = `https://${url}`;
  }

  if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
    return url.startsWith('//') ? `https:${url}` : url;
  }

  const origin = getApiOrigin();
  if (url.startsWith('/')) return `${origin}${url}`;
  if (/^uploads\//i.test(url)) return `${origin}/${url}`;

  return url;
}

module.exports = { resolveMediaUrl, getApiOrigin };
