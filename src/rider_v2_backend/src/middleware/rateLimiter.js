"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.otpLimiter = exports.authLimiter = exports.apiLimiter = void 0;
var _expressRateLimit = _interopRequireDefault(require("express-rate-limit"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
// Simple in-memory store (will be replaced with Redis when available)
// For production, use a proper Redis store implementation
var createStore = function createStore() {
  // If Redis is configured, we could use a Redis store here
  // For now, using default memory store
  return undefined;
};

// General API rate limiter (unlimited by default)
var rateLimitDisabled = process.env.RATE_LIMIT_ENABLED !== '1' && process.env.RATE_LIMIT_ENABLED !== 'true'; // Unlimited by default
var apiLimiter = exports.apiLimiter = (0, _expressRateLimit["default"])({
  windowMs: 15 * 60 * 1000,
  // 15 minutes
  max: 100,
  // Limit each IP to 100 requests per windowMs
  skip: function skip() {
    return rateLimitDisabled;
  },
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false,
  // Disable the `X-RateLimit-*` headers
  // Store will be configured when Redis is fully integrated
  store: createStore(),
  handler: function handler(_req, res) {
    res.status(429).json({
      error: "Too many requests",
      message: "Too many requests from this IP, please try again later.",
      retryAfter: 900 // 15 minutes in seconds
    });
  }
});

// Stricter rate limiter for authentication endpoints
var authLimiter = exports.authLimiter = (0, _expressRateLimit["default"])({
  windowMs: 15 * 60 * 1000,
  // 15 minutes
  max: 5,
  skip: function skip() {
    return rateLimitDisabled;
  },
  // Limit each IP to 5 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore(),
  skipSuccessfulRequests: true,
  // Don't count successful requests
  handler: function handler(_req, res) {
    res.status(429).json({
      error: "Too many authentication attempts",
      message: "Too many authentication attempts from this IP, please try again later.",
      retryAfter: 900 // 15 minutes in seconds
    });
  }
});

// Rate limiter for OTP endpoints (very strict)
var otpLimiter = exports.otpLimiter = (0, _expressRateLimit["default"])({
  windowMs: 60 * 1000,
  // 1 minute
  max: 3,
  skip: function skip() {
    return rateLimitDisabled;
  },
  // Limit each IP to 3 OTP requests per minute
  message: "Too many OTP requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore(),
  handler: function handler(_req, res) {
    res.status(429).json({
      error: "Too many OTP requests",
      message: "Too many OTP requests from this IP, please try again in a minute.",
      retryAfter: 60
    });
  }
});