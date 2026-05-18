/**
 * API Version Tracking Middleware
 * File: src/middleware/apiVersion.middleware.js
 *
 * P2.1: Tracks and validates API version from request path
 * - Extracts version from URL path (e.g., /api/v1/...)
 * - Attaches version to request context
 * - Enforces minimum supported version
 * - Adds deprecation warnings for old versions
 */

const logger = require('../core/utils/logger');

const SUPPORTED_VERSIONS = ['v1'];
const DEPRECATED_VERSIONS = {
  'v0.9': { deprecatedAt: '2026-01-01', sunsetAt: '2026-06-01' }
  // Add deprecated versions here
};

/**
 * Extract API version from request path
 * Supports: /api/v1/*, /api/v2/*, etc.
 */
const extractVersion = (path) => {
  const match = path.match(/\/api\/(v\d+)\//);
  return match ? match[1] : null;
};

/**
 * API Version Tracking Middleware
 */
const apiVersionMiddleware = (req, res, next) => {
  const version = extractVersion(req.path);

  if (!version) {
    // Not an API request, skip
    return next();
  }

  // Attach version to request
  req.apiVersion = version;

  // Check if version is supported
  if (!SUPPORTED_VERSIONS.includes(version)) {
    // Check if deprecated
    if (DEPRECATED_VERSIONS[version]) {
      const deprecationInfo = DEPRECATED_VERSIONS[version];
      logger.warn(
        `[API] Deprecated API version ${version} used. Sunset at ${deprecationInfo.sunsetAt}`
      );

      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', new Date(deprecationInfo.sunsetAt).toUTCString());
      res.setHeader('Warning', `299 - "API version ${version} is deprecated"`);
    } else {
      // Unsupported version
      logger.warn(`[API] Unsupported API version: ${version}`);
      return res.status(400).json({
        error: `Unsupported API version: ${version}`,
        code: 'UNSUPPORTED_API_VERSION',
        supportedVersions: SUPPORTED_VERSIONS
      });
    }
  } else {
    // Supported version - log for analytics
    logger.info(`[API] Request to ${version} endpoint: ${req.method} ${req.path}`);
  }

  next();
};

/**
 * Extract service type from request path
 * Supports: /api/v1/picker/*, /api/v1/rider/*, /api/v1/customer/*
 */
const extractService = (path) => {
  const match = path.match(/\/api\/v\d+\/(\w+)\//);
  return match ? match[1] : null;
};

/**
 * Get API version from request
 */
const getApiVersion = (req) => {
  return req.apiVersion || 'v1';
};

/**
 * Get service type from request
 */
const getService = (req) => {
  return extractService(req.path) || 'unknown';
};

module.exports = {
  apiVersionMiddleware,
  extractVersion,
  extractService,
  getApiVersion,
  getService
};
