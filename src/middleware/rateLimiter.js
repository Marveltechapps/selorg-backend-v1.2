const rateLimit = require('express-rate-limit');

const rateLimitDisabled = process.env.RATE_LIMIT_ENABLED !== '1' && process.env.RATE_LIMIT_ENABLED !== 'true'; // Unlimited by default

// General API rate limiter (unlimited by default; set RATE_LIMIT_ENABLED=1 to enable)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10), // Default 1000 requests per 15 minutes
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  skip: (req) => {
    if (rateLimitDisabled) return true; // Unlimited - skip all
    return req.path === '/health' || req.path === '/health/ready' || req.path === '/health/db';
  },
});

// Auth endpoints rate limiter (unlimited by default; set RATE_LIMIT_ENABLED=1 to enable)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10), // Default 10 failed attempts per 15 min per IP
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts, please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
  skipFailedRequests: false,
  skip: () => rateLimitDisabled,
});

module.exports = {
  apiLimiter,
  authLimiter,
};

