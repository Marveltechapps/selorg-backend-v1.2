"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.verifyOtpSchema = exports.requestOtpSchema = exports.refreshTokenSchema = void 0;
var _zod = require("zod");
var requestOtpSchema = exports.requestOtpSchema = _zod.z.object({
  phoneNumber: _zod.z.string().min(10).max(20).regex(/^\+?[\d\s\-]+$/, "phoneNumber must be a valid international number (digits, optional +, spaces or dashes)").transform(function (s) {
    return s.replace(/\s/g, "").replace(/-/g, "");
  }),
  userType: _zod.z["enum"](["rider"]).optional()["default"]("rider")
});
var verifyOtpSchema = exports.verifyOtpSchema = _zod.z.object({
  phoneNumber: requestOtpSchema.shape.phoneNumber,
  code: _zod.z.string().length(6).regex(/^[0-9]+$/, "code must be numeric"),
  sessionId: _zod.z.string().optional(),
  userType: _zod.z["enum"](["rider"]).optional()["default"]("rider")
});
var refreshTokenSchema = exports.refreshTokenSchema = _zod.z.object({
  refreshToken: _zod.z.string().min(1)
});