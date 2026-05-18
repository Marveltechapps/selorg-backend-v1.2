/**
 * Payment Idempotency Middleware
 * File: src/middleware/idempotency.js
 *
 * CRITICAL FIX P0.2: Prevents duplicate payment processing
 * - Requires Idempotency-Key header for payment operations
 * - Caches responses for 24 hours using Redis
 * - Returns 400 if header missing
 * - Enables safe request retries
 */

const Redis = require('ioredis');
const logger = require('../core/utils/logger');

// Initialize Redis client (optional, fallback to in-memory)
let redisClient = null;
const inMemoryCache = new Map();

try {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });

  redisClient.on('error', (err) => logger.error('Redis error:', err));
  redisClient.on('connect', () => logger.info('Redis connected for idempotency'));
} catch (error) {
  logger.warn('Redis unavailable, falling back to in-memory cache:', error.message);
}

/**
 * Idempotency Middleware
 * ✅ FIX P0.2: Prevents duplicate payment processing
 * - Checks for Idempotency-Key header
 * - Prevents duplicate payment processing
 * - Caches responses for 24 hours
 * - Returns 400 if header missing
 */
const idempotencyMiddleware = async (req, res, next) => {
  // Only apply to payment/refund endpoints
  const isPaymentEndpoint = req.path.includes('/payment') || req.path.includes('/refund') || req.path.includes('/checkout');

  if (!isPaymentEndpoint) {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'];

  // ✅ FIX: Require idempotency key for all payment operations
  if (!idempotencyKey) {
    logger.warn(`[Idempotency] Missing header for endpoint: ${req.path}`);
    return res.status(400).json({
      error: 'Idempotency-Key header is required for payment operations',
      code: 'MISSING_IDEMPOTENCY_KEY',
      documentation: 'Include header: Idempotency-Key: <unique-uuid>'
    });
  }

  // Validate idempotency key format (UUID-like, at least 20 chars)
  if (!/^[\w-]{20,}$/.test(idempotencyKey)) {
    return res.status(400).json({
      error: 'Invalid Idempotency-Key format. Must be at least 20 alphanumeric characters.',
      code: 'INVALID_KEY_FORMAT'
    });
  }

  // Create cache key: idempotency:key:userId:endpoint
  const userId = req.user?.userId || req.user?._id || 'anonymous';
  const cacheKey = `idempotency:${idempotencyKey}:${userId}:${req.path}`;

  try {
    // Check if request was already processed
    let cachedResponse = null;

    if (redisClient) {
      // Try Redis first
      try {
        cachedResponse = await redisClient.get(cacheKey);
      } catch (err) {
        logger.error('[Idempotency] Redis get error:', err);
        cachedResponse = inMemoryCache.get(cacheKey);
      }
    } else {
      // Fallback to in-memory cache
      cachedResponse = inMemoryCache.get(cacheKey);
    }

    if (cachedResponse) {
      const response = typeof cachedResponse === 'string' ? JSON.parse(cachedResponse) : cachedResponse;
      logger.info(`[Idempotency] Returning cached response for key: ${idempotencyKey}`);

      // Add header to indicate this is cached
      res.setHeader('X-Idempotency-Cache', 'hit');
      return res.status(response.statusCode).json(response.body);
    }

    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function(data) {
      // Only cache successful responses (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cacheData = {
          statusCode: res.statusCode,
          body: data
        };

        const cacheDataStr = JSON.stringify(cacheData);

        if (redisClient) {
          // Cache in Redis for 24 hours
          redisClient.setex(cacheKey, 86400, cacheDataStr).catch((err) => {
            logger.error(`[Idempotency] Failed to cache response:`, err);
          }).then(() => {
            logger.info(`[Idempotency] Cached response for key: ${idempotencyKey}`);
          });
        } else {
          // Fallback to in-memory cache
          inMemoryCache.set(cacheKey, cacheData);
          // Clean up after 24 hours
          setTimeout(() => inMemoryCache.delete(cacheKey), 86400000);
        }
      }

      // Add header to indicate this is first occurrence
      res.setHeader('X-Idempotency-Cache', 'miss');
      return originalJson(data);
    };

    next();
  } catch (error) {
    logger.error('[Idempotency] Middleware error:', error);
    // Don't block payment if cache fails, but log it
    logger.warn('[Idempotency] Cache check failed, proceeding without protection');
    next();
  }
};

/**
 * Check if payment already exists (database-level idempotency)
 */
const checkPaymentIdempotency = async (orderId, idempotencyKey, PaymentModel) => {
  try {
    const existingPayment = await PaymentModel.findOne({
      order_id: orderId,
      idempotency_key: idempotencyKey,
      status: { $in: ['success', 'pending'] }
    });

    if (existingPayment) {
      logger.info(`[Idempotency] Found existing payment: ${existingPayment._id}`);
      return {
        exists: true,
        paymentId: existingPayment._id,
        status: existingPayment.status
      };
    }

    return { exists: false };
  } catch (error) {
    logger.error('[Idempotency] Database check failed:', error);
    throw error;
  }
};

/**
 * Verify Idempotency Key Format
 */
const verifyIdempotencyKey = (key) => {
  return /^[\w-]{20,}$/.test(key);
};

module.exports = {
  idempotencyMiddleware,
  checkPaymentIdempotency,
  verifyIdempotencyKey
};
