"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.signinRouter = void 0;

var _express = require("express");
var _rateLimiter = require("../../middleware/rateLimiter.js");
var _signinService = require("./signin.service.js");

var signinRouter = exports.signinRouter = (0, _express.Router)();

function validateMobileNumber(mobileNumber) {
  var s = mobileNumber != null ? String(mobileNumber).trim() : "";
  var digits = s.replace(/\D/g, "");
  if (digits.length !== 10) return { valid: false, error: "mobileNumber must be exactly 10 digits" };
  if (/^0+$/.test(digits)) return { valid: false, error: "mobileNumber cannot be all zeros" };
  return { valid: true, mobile: digits };
}

// POST /api/signin/send-otp — Body: { "mobileNumber": "9876543210" }, Content-Type: application/json
signinRouter.post("/send-otp", _rateLimiter.otpLimiter, function (req, res) {
  var body = req.body || {};
  var mobileNumber = body.mobileNumber != null ? body.mobileNumber : body.phoneNumber;
  var validation = validateMobileNumber(mobileNumber);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error, hint: "Send JSON body: { \"mobileNumber\": \"10-digit number\" }" });
  }
  (0, _signinService.sendOtpSignin)(validation.mobile)
    .then(function (result) {
      return res.status(200).json(result);
    })
    .catch(function (err) {
      var msg = err && err.message || "Failed to send OTP";
      if (msg.indexOf("Failed to send OTP via SMS") !== -1) {
        return res.status(500).json({ error: "Failed to send OTP via SMS", hint: "Check config.json smsvendor URL and gateway response." });
      }
      if (msg.indexOf("already registered") !== -1 || (err && err.code === 11000)) {
        return res.status(409).json({ error: msg });
      }
      return res.status(400).json({ error: msg });
    });
});

// POST /api/signin/verify-otp — Body: { "mobileNumber": "9876543210", "otp": "1234" }
signinRouter.post("/verify-otp", _rateLimiter.authLimiter, function (req, res) {
  var body = req.body || {};
  var mobileNumber = body.mobileNumber != null ? body.mobileNumber : body.phoneNumber;
  var otp = body.otp != null ? body.otp : body.enteredOTP;
  var validation = validateMobileNumber(mobileNumber);
  if (!validation.valid) {
    return res.status(400).json({ message: validation.error });
  }
  if (otp == null || String(otp).trim() === "") {
    return res.status(400).json({ message: "otp is required" });
  }
  (0, _signinService.verifyOtpSignin)(validation.mobile, otp)
    .then(function (result) {
      return res.status(200).json(result);
    })
    .catch(function (err) {
      var msg = err && err.message || "Failed to verify OTP";
      return res.status(400).json({ message: msg });
    });
});

// POST /api/signin/existing-user-login — Body: { "mobileNumber": "9876543210" }
// If user exists and onboarding complete, returns token so app can skip OTP and go to dashboard
signinRouter.post("/existing-user-login", _rateLimiter.authLimiter, function (req, res) {
  var body = req.body || {};
  var mobileNumber = body.mobileNumber != null ? body.mobileNumber : body.phoneNumber;
  var validation = validateMobileNumber(mobileNumber);
  if (!validation.valid) {
    return res.status(400).json({ canSkipOtp: false, error: validation.error });
  }
  (0, _signinService.existingUserLogin)(validation.mobile)
    .then(function (result) {
      return res.status(200).json(result);
    })
    .catch(function (err) {
      return res.status(400).json({ canSkipOtp: false, error: err && err.message || "Failed" });
    });
});

// POST /api/signin/resend-otp — Body: { "mobileNumber": "9876543210" }
signinRouter.post("/resend-otp", _rateLimiter.otpLimiter, function (req, res) {
  var body = req.body || {};
  var mobileNumber = body.mobileNumber != null ? body.mobileNumber : body.phoneNumber;
  var validation = validateMobileNumber(mobileNumber);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  (0, _signinService.resendOtpSignin)(validation.mobile)
    .then(function (result) {
      return res.status(200).json(result);
    })
    .catch(function (err) {
      var msg = err && err.message || "Failed to resend OTP";
      if (msg === "User not found") {
        return res.status(400).json({ message: "User not found" });
      }
      if (msg.indexOf("Failed to send OTP via SMS") !== -1) {
        return res.status(500).json({ error: "Failed to send OTP via SMS" });
      }
      return res.status(500).json({ error: msg });
    });
});
