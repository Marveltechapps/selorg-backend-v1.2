'use strict';

/**
 * Resolve store id from request. Returns null when missing (caller should 400).
 */
function resolveStoreId(req) {
  const fromQuery = req.query?.storeId;
  const fromBody = req.body?.storeId;
  const raw = (fromQuery || fromBody || '').toString().trim();
  return raw || null;
}

function requireStoreId(req, res) {
  const storeId = resolveStoreId(req);
  if (!storeId) {
    res.status(400).json({ success: false, error: 'storeId is required' });
    return null;
  }
  return storeId;
}

module.exports = { resolveStoreId, requireStoreId };
