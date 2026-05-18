/**
 * Payment Idempotency Middleware
 * File: src/middleware/idempotency.js
 *
 * CRITICAL FIX P0.2: Prevents duplicate payment processing
 * - Requires Idempotency-Key header for payment operations
 * - Caches responses for 24 hours using Redis when configured
 * - Returns 400 if header missing
 * - Enables safe request retries
 */

const Redis = require('ioredis');
const logger = require('../core/utils/logger');
const {
  isRedisConfigured,
  getRedisUrl,
  getRedisHostOptions,
  createIoRedisOptions,
  attachRedisEventHandlers,
} = require('../utils/redisConnection');

let redisClient = null;
let redisInitAttempted = false;
const inMemoryCache = new Map();

function getIdempotencyRedisClient() {
  if (!isRedisConfigured()) return null;
  if (redisClient) return redisClient;
  if (redisInitAttempted) return null;
  redisInitAttempted = true;

  try {
    const url = getRedisUrl();
    const opts = createIoRedisOptions();
    redisClient = url
      ? new Redis(url, opts)
      : new Redis({ ...getRedisHostOptions(), ...opts });
    attachRedisEventHandlers(redisClient, 'idempotency-redis');
  } catch (error) {
    logger.warn('Redis unavailable for idempotency, using in-memory cache:', error.message);
    redisClient = null;
  }
  return redisClient;
}

/**
 * Idempotency Middleware
 */
const idempotencyMiddleware = async (req, res, next) => {
  const isPaymentEndpoint = req.path.includes('/payment') || req.path.includes('/refund') || req.path.includes('/checkout');

  if (!isPaymentEndpoint) {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    logger.warn(`[Idempotency] Missing header for endpoint: ${req.path}`);
    return res.status(400).json({
      error: 'Idempotency-Key header is required for payment operations',
      code: 'MISSING_IDEMPOTENCY_KEY',
      documentation: 'Include header: Idempotency-Key: <unique-uuid>',
    });
  }

  if (!/^[\w-]{20,}$/.test(idempotencyKey)) {
    return res.status(400).json({
      error: 'Invalid Idempotency-Key format. Must be at least 20 alphanumeric characters.',
      code: 'INVALID_KEY_FORMAT',
    });
  }

  const userId = req.user?.userId || req.user?._id || 'anonymous';
  const cacheKey = `idempotency:${idempotencyKey}:${userId}:${req.path}`;
  const redis = getIdempotencyRedisClient();

  try {
    let cachedResponse = null;

    if (redis) {
      try {
        cachedResponse = await redis.get(cacheKey);
      } catch (err) {
        logger.warn('[Idempotency] Redis get error:', err.message);
        cachedResponse = inMemoryCache.get(cacheKey);
      }
    } else {
      cachedResponse = inMemoryCache.get(cacheKey);
    }

    if (cachedResponse) {
      const response = typeof cachedResponse === 'string' ? JSON.parse(cachedResponse) : cachedResponse;
      logger.info(`[Idempotency] Returning cached response for key: ${idempotencyKey}`);
      res.setHeader('X-Idempotency-Cache', 'hit');
      return res.status(response.statusCode).json(response.body);
    }

    const originalJson = res.json.bind(res);

    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cacheData = {
          statusCode: res.statusCode,
          body: data,
        };
        const cacheDataStr = JSON.stringify(cacheData);

        if (redis) {
          redis.setex(cacheKey, 86400, cacheDataStr).catch((err) => {
            logger.warn('[Idempotency] Failed to cache response:', err.message);
          });
        } else {
          inMemoryCache.set(cacheKey, cacheData);
          setTimeout(() => inMemoryCache.delete(cacheKey), 86400000);
        }
      }

      res.setHeader('X-Idempotency-Cache', 'miss');
      return originalJson(data);
    };

    next();
  } catch (error) {
    logger.error('[Idempotency] Middleware error:', error);
    logger.warn('[Idempotency] Cache check failed, proceeding without protection');
    next();
  }
};

const checkPaymentIdempotency = async (orderId, idempotencyKey, PaymentModel) => {
  try {
    const existingPayment = await PaymentModel.findOne({
      order_id: orderId,
      idempotency_key: idempotencyKey,
      status: { $in: ['success', 'pending'] },
    });

    if (existingPayment) {
      logger.info(`[Idempotency] Found existing payment: ${existingPayment._id}`);
      return {
        exists: true,
        paymentId: existingPayment._id,
        status: existingPayment.status,
      };
    }

    return { exists: false };
  } catch (error) {
    logger.error('[Idempotency] Database check failed:', error);
    throw error;
  }
};

const verifyIdempotencyKey = (key) => /^[\w-]{20,}$/.test(key);

module.exports = {
  idempotencyMiddleware,
  checkPaymentIdempotency,
  verifyIdempotencyKey,
};
