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
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10) return { valid: false, error: "mobileNumber must be 10 digits (or 12 with 91)" };
  if (/^0+$/.test(digits)) return { valid: false, error: "mobileNumber cannot be all zeros" };
  return { valid: true, mobile: digits };
}

function normalizeEmail(email) {
  var e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { valid: false, error: "Please enter a valid email address" };
  return { valid: true, email: e };
}

function getPreferredChannel(body) {
  var channel = body && body.preferredChannel != null ? String(body.preferredChannel).toLowerCase() : "sms";
  if (channel === "whatsapp" || channel === "email" || channel === "sms") return channel;
  return "sms";
}

// POST /api/signin/send-otp
// Phone: { mobileNumber, preferredChannel?: sms|whatsapp }
// Email: { email, preferredChannel: email }
signinRouter.post("/send-otp", _rateLimiter.otpLimiter, function (req, res) {
  var body = req.body || {};
  var preferredChannel = getPreferredChannel(body);

  if (body.email != null && String(body.email).trim()) {
    var emailValidation = normalizeEmail(body.email);
    if (!emailValidation.valid) {
      return res.status(400).json({ error: emailValidation.error });
    }
    return (0, _signinService.sendOtpEmailSignin)(emailValidation.email)
      .then(function (result) {
        return res.status(200).json(result);
      })
      .catch(function (err) {
        return res.status(400).json({ error: err && err.message || "Failed to send OTP" });
      });
  }

  var mobileNumber = body.mobileNumber != null ? body.mobileNumber : body.phoneNumber != null ? body.phoneNumber : body.phone;
  var validation = validateMobileNumber(mobileNumber);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error, hint: 'Send JSON body: { "mobileNumber": "10-digit number" }' });
  }

  (0, _signinService.sendOtpSignin)(validation.mobile, { preferredChannel: preferredChannel })
    .then(function (result) {
      return res.status(200).json(result);
    })
    .catch(function (err) {
      var msg = err && err.message || "Failed to send OTP";
      if (msg.indexOf("Failed to send OTP via") !== -1) {
        return res.status(500).json({ error: msg, hint: "Check SMS/WhatsApp gateway configuration." });
      }
      if (msg.indexOf("already registered") !== -1 || (err && err.code === 11000)) {
        return res.status(409).json({ error: msg });
      }
      return res.status(400).json({ error: msg });
    });
});

// POST /api/signin/verify-otp
signinRouter.post("/verify-otp", _rateLimiter.authLimiter, function (req, res) {
  var body = req.body || {};
  var otp = body.otp != null ? body.otp : body.enteredOTP;

  if (body.email != null && String(body.email).trim()) {
    var emailValidation = normalizeEmail(body.email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.error });
    }
    if (otp == null || String(otp).trim() === "") {
      return res.status(400).json({ message: "otp is required" });
    }
    return (0, _signinService.verifyOtpEmailSignin)(emailValidation.email, otp)
      .then(function (result) {
        return res.status(200).json(result);
      })
      .catch(function (err) {
        return res.status(400).json({ message: err && err.message || "Failed to verify OTP" });
      });
  }

  var mobileNumber = body.mobileNumber != null ? body.mobileNumber : body.phoneNumber != null ? body.phoneNumber : body.phone;
  var validation = validateMobileNumber(mobileNumber);
  if (!validation.valid) {
    return res.status(400).json({ message: validation.error });
  }
  if (otp == null || String(otp).trim() === "") {
    return res.status(400).json({ message: "otp is required" });
  }

  (0, _signinService.verifyOtpSignin)(validation.mobile, otp, { preferredChannel: getPreferredChannel(body) })
    .then(function (result) {
      return res.status(200).json(result);
    })
    .catch(function (err) {
      return res.status(400).json({ message: err && err.message || "Failed to verify OTP" });
    });
});

// POST /api/signin/existing-user-login
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

// POST /api/signin/resend-otp
signinRouter.post("/resend-otp", _rateLimiter.otpLimiter, function (req, res) {
  var body = req.body || {};
  var preferredChannel = getPreferredChannel(body);

  if (body.email != null && String(body.email).trim()) {
    var emailValidation = normalizeEmail(body.email);
    if (!emailValidation.valid) {
      return res.status(400).json({ error: emailValidation.error });
    }
    return (0, _signinService.sendOtpEmailSignin)(emailValidation.email)
      .then(function (result) {
        return res.status(200).json({ success: true, message: "OTP resent successfully", channel: result.channel || "email" });
      })
      .catch(function (err) {
        return res.status(500).json({ error: err && err.message || "Failed to resend OTP" });
      });
  }

  var mobileNumber = body.mobileNumber != null ? body.mobileNumber : body.phoneNumber;
  var validation = validateMobileNumber(mobileNumber);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  (0, _signinService.resendOtpSignin)(validation.mobile, { preferredChannel: preferredChannel })
    .then(function (result) {
      return res.status(200).json(result);
    })
    .catch(function (err) {
      var msg = err && err.message || "Failed to resend OTP";
      if (msg === "User not found") {
        return res.status(400).json({ message: "User not found" });
      }
      if (msg.indexOf("Failed to send OTP via") !== -1) {
        return res.status(500).json({ error: msg });
      }
      return res.status(500).json({ error: msg });
    });
});
