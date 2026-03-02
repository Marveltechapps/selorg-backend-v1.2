"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.env = void 0;
var _dotenv = require("dotenv");
var _zod = require("zod");
(0, _dotenv.config)();
var envSchema = _zod.z.object({
  NODE_ENV: _zod.z["enum"](["development", "test", "production"])["default"]("development"),
  PORT: _zod.z.coerce.number()["default"](5001),
  JWT_SECRET: _zod.z.string().min(16, "JWT_SECRET must be at least 16 characters long")["default"]("dev-insecure-secret-please-change"),
  OTP_EXPIRY_MINUTES: _zod.z.coerce.number().min(1)["default"](5),
  MONGO_URI: _zod.z.string().url()["default"]("mongodb+srv://marveltech32_db_user:d8gzgC2jyBLaSFA9@cluster0.hptceac.mongodb.net/rider-app?retryWrites=true&w=majority&appName=Cluster0"),
  DEBUG_MODE: _zod.z.coerce.number().optional()["default"](0),
  VIN_API_KEY: _zod.z.string().optional(),
  VIN_API_OWNER: _zod.z.string().optional(),
  VIN_BASE_URL: _zod.z.string().optional(),
  VIN_ORDER_URL: _zod.z.string().optional(),
  VIN_CACHE_FLAG: _zod.z.coerce.number().optional()["default"](0),
  SMS_VENDOR_URL: _zod.z.string().optional(),
  ALLOWED_ORIGINS: _zod.z.string().optional()
});
var env = exports.env = envSchema.parse(process.env);