/**
 * Phase A — Global JSON envelope for APIs that still use legacy `res.json({ ... })`.
 * Skips responses that already include a top-level `success` field (ResponseFormatter-compatible).
 * Disabled when DISABLE_API_ENVELOPE=1 or for health/metrics/docs/webhooks.
 */
const ResponseFormatter = require('../utils/ResponseFormatter');

function shouldSkip(req) {
  if (process.env.DISABLE_API_ENVELOPE === '1' || process.env.DISABLE_API_ENVELOPE === 'true') {
    return true;
  }
  const p = req.path || '';
  if (
    p === '/health' ||
    p === '/healthz' ||
    p.startsWith('/health/') ||
    p === '/metrics' ||
    p.startsWith('/api-docs')
  ) {
    return true;
  }
  if (p.includes('/webhooks/') || p.includes('/callback') || p.includes('/worldline')) {
    return true;
  }
  return false;
}

function apiEnvelopeMiddleware(req, res, next) {
  if (shouldSkip(req)) return next();

  const origJson = res.json.bind(res);
  res.json = function envelopeJson(body) {
    const status = res.statusCode || 200;

    if (body === undefined || body === null) {
      return origJson(ResponseFormatter.success(null, status >= 400 ? 'Error' : 'Success'));
    }
    if (typeof body === 'string') {
      return origJson(body);
    }
    if (Buffer.isBuffer(body)) {
      return origJson(body);
    }

    if (typeof body === 'object') {
      if (Object.prototype.hasOwnProperty.call(body, 'success')) {
        return origJson(body);
      }
      if (status >= 400) {
        const raw = body.error ?? body.message ?? body;
        const msg =
          typeof raw === 'string'
            ? raw
            : typeof raw === 'object' && raw !== null && raw.message
              ? String(raw.message)
              : 'Request failed';
        return origJson(ResponseFormatter.error(msg, status));
      }
      return origJson(ResponseFormatter.success(body, 'Success'));
    }

    return origJson(body);
  };

  next();
}

module.exports = { apiEnvelopeMiddleware, shouldSkip };
