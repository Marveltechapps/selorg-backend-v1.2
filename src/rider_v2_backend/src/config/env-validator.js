"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validateEnvironment = validateEnvironment;
var _env = require("./env.js");
/**
 * Validate environment configuration and log warnings/errors
 */
function validateEnvironment() {
  var warnings = [];
  var errors = [];

  // Validate API base URL format
  var apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5001";
  try {
    var url = new URL(apiBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push("Invalid API_BASE_URL protocol: ".concat(url.protocol, ". Must be http:// or https://"));
    }
  } catch (error) {
    errors.push("Invalid API_BASE_URL format: ".concat(apiBaseUrl));
  }

  // Validate WebSocket URL derivation
  var wsUrl = apiBaseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  try {
    var wsUrlObj = new URL(wsUrl);
    if (!['ws:', 'wss:'].includes(wsUrlObj.protocol)) {
      warnings.push("WebSocket URL protocol may be invalid: ".concat(wsUrlObj.protocol));
    }
  } catch (error) {
    warnings.push("WebSocket URL derivation may be invalid: ".concat(wsUrl));
  }

  // Validate PORT
  if (_env.env.PORT < 1 || _env.env.PORT > 65535) {
    errors.push("Invalid PORT: ".concat(_env.env.PORT, ". Must be between 1 and 65535"));
  }

  // Validate JWT_SECRET in production
  if (_env.env.NODE_ENV === "production" && _env.env.JWT_SECRET === "dev-insecure-secret-please-change") {
    errors.push("JWT_SECRET must be changed in production environment");
  }

  // Validate MongoDB URI
  if (!_env.env.MONGO_URI || !_env.env.MONGO_URI.startsWith("mongodb")) {
    errors.push("MONGO_URI must be a valid MongoDB connection string");
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn("[Env Validator] Warnings:", warnings);
  }

  // Log errors and exit if critical
  if (errors.length > 0) {
    console.error("[Env Validator] Errors:", errors);
    if (_env.env.NODE_ENV === "production") {
      throw new Error("Environment validation failed: ".concat(errors.join(", ")));
    }
  }

  // Log successful validation
  if (warnings.length === 0 && errors.length === 0) {
    console.log("[Env Validator] ✅ Environment configuration validated successfully");
    console.log("[Env Validator] API Base URL: ".concat(apiBaseUrl));
    console.log("[Env Validator] WebSocket URL: ".concat(wsUrl));
    console.log("[Env Validator] Port: ".concat(_env.env.PORT));
    console.log("[Env Validator] Environment: ".concat(_env.env.NODE_ENV));
  }
}