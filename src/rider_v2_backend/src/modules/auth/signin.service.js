"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resendOtpSignin = exports.verifyOtpSignin = exports.sendOtpSignin = void 0;

var _appConfig = require("../../config/appConfig.js");
var _token = require("../../utils/token.js");
var _Rider = require("../../models/Rider.js");
var _riderService = require("../delivery/rider.service.js");
var _kycService = require("../kyc/kyc.service.js");

// OTP process per OTP_PROCESS_WORKFLOW.md
var OTP_EXPIRY_MINUTES = 5;
var TEST_MOBILE = "9698790921";
var TEST_OTP = "8790";
var SIGNIN_SMS_MESSAGE = "Dear Applicant, Your OTP for Mobile No. Verification is {otp} . MJPTBCWREIS - EVOLGN";

function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Real-time OTP: GET URL per OTP_PROCESS_WORKFLOW.md — smsvendor + paramMobile + paramMessage (from config.json).
function buildSigninSmsUrl(mobileNumber, otp) {
  var base = (0, _appConfig.getSmsVendorUrl)();
  if (!base) return null;
  var mobile = String(mobileNumber).replace(/\D/g, "").slice(-10);
  if (mobile.length !== 10) return null;
  var message = SIGNIN_SMS_MESSAGE.replace("{otp}", otp);
  var mobileParam = (0, _appConfig.getSmsToParam)();
  var msgParam = (0, _appConfig.getSmsMessageParam)();
  var sep = base.includes("?") && !base.endsWith("&") && !base.endsWith("?") ? "&" : "?";
  var url = base + sep + mobileParam + "=" + encodeURIComponent(mobile) + "&" + msgParam + "=" + encodeURIComponent(message);
  return url;
}

// Real-time OTP: HTTP GET to SMS gateway. Success = 2xx and (JSON status "success" or body contains success/sent).
function sendSigninSms(mobileNumber, otp) {
  var url = buildSigninSmsUrl(mobileNumber, otp);
  if (!url) return Promise.resolve({ success: false, reason: "No SMS vendor URL or invalid mobile" });
  return fetch(url, { method: "GET" })
    .then(function (res) { return res.text().then(function (text) { return { status: res.status, ok: res.ok, body: text }; }); })
    .then(function (_ref) {
      var status = _ref.status, ok = _ref.ok, body = _ref.body;
      var bodyStr = (body || "").trim();
      var bodyLower = bodyStr.toLowerCase();
      var looksSuccess = /success|sent|submit|ok|accepted/.test(bodyLower) && !/fail|error|invalid|denied|reject/.test(bodyLower);
      try {
        var data = JSON.parse(bodyStr);
        var s = data && (data.status || data.Status || data.result);
        if (s != null && String(s).toLowerCase() === "success") looksSuccess = true;
        if (s != null && (/fail|error|invalid|denied/.test(String(s).toLowerCase()))) looksSuccess = false;
      } catch (_) {
        if (bodyStr.length < 200 && looksSuccess) { /* plain text success */ }
      }
      var success = ok && looksSuccess;
      return { success: !!success, body: bodyStr, status: status };
    })
    .catch(function (err) {
      return { success: false, body: String(err && err.message || err), status: 0 };
    });
}

var sendOtpSignin = exports.sendOtpSignin = function sendOtpSignin(mobileNumber) {
  var mobile = String(mobileNumber).replace(/\D/g, "").trim();
  if (mobile.length !== 10 || /^0+$/.test(mobile)) {
    return Promise.reject(new Error("Invalid mobile number"));
  }
  var otp = mobile === TEST_MOBILE ? TEST_OTP : generateOTP();
  var expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  return (0, _riderService.createRider)({
    name: "Rider " + mobile.slice(-4),
    phoneNumber: mobile,
    vehicleType: "bike"
  }).then(function (_ref) {
    var rider = _ref.rider;
    return sendSigninSms(mobile, otp).then(function (smsResult) {
      if (!smsResult.success) {
        if (smsResult.body) console.warn("[signin] SMS gateway failure — status:", smsResult.status, "body:", smsResult.body.substring(0, 200));
        return Promise.reject(new Error("Failed to send OTP via SMS"));
      }
      rider.otp = otp;
      rider.otpExpiry = expiry;
      return rider.save().then(function () {
        return { message: "OTP sent successfully" };
      });
    });
  });
};

var verifyOtpSignin = exports.verifyOtpSignin = function verifyOtpSignin(mobileNumber, enteredOTP) {
  var mobile = String(mobileNumber).replace(/\D/g, "").trim();
  var otpInput = (enteredOTP != null ? String(enteredOTP) : "").trim();
  if (!mobile || !otpInput) {
    return Promise.reject(new Error("mobileNumber and otp are required"));
  }

  return _Rider.Rider.findOne({ phoneNumber: mobile }).then(function (user) {
    if (!user) return Promise.reject(new Error("User not found"));
    if (user.otp == null || user.otp === "") return Promise.reject(new Error("No OTP requested or expired"));
    if (user.otpExpiry && new Date() > new Date(user.otpExpiry)) return Promise.reject(new Error("OTP expired"));
    if (String(user.otp).trim() !== otpInput) return Promise.reject(new Error("Incorrect OTP"));

    user.otp = null;
    user.otpExpiry = null;
    user.isVerified = !!(user.name && user.name.trim());
    return user.save().then(function () {
      var token = (0, _token.signToken)({
        sub: user.riderId,
        phoneNumber: user.phoneNumber,
        name: user.name
      }, "28d");
      return (0, _kycService.getUserStatus)(user.riderId)
        .then(function (documents) {
          var required = documents.filter(function (d) { return d.required; });
          var allVerified = required.length === 0 || required.every(function (d) { return d.status === "verified"; });
          var onboardingComplete = !!(user.name && user.name.trim()) && allVerified;
          return {
            message: "OTP verified successfully",
            userId: user.riderId,
            token: token,
            isVerified: user.isVerified,
            name: user.name || null,
            onboardingComplete: onboardingComplete
          };
        })
        .catch(function () {
          return {
            message: "OTP verified successfully",
            userId: user.riderId,
            token: token,
            isVerified: user.isVerified,
            name: user.name || null,
            onboardingComplete: false
          };
        });
    });
  });
};

// Existing user: if registered and onboarding complete, return token so app can skip OTP and go to dashboard
var existingUserLogin = exports.existingUserLogin = function existingUserLogin(mobileNumber) {
  var mobile = String(mobileNumber).replace(/\D/g, "").trim();
  if (!mobile || mobile.length !== 10) return Promise.reject(new Error("mobileNumber must be 10 digits"));

  return _Rider.Rider.findOne({ phoneNumber: mobile }).then(function (user) {
    if (!user) return Promise.resolve({ canSkipOtp: false });
    return (0, _kycService.getUserStatus)(user.riderId)
      .then(function (documents) {
        var required = documents.filter(function (d) { return d.required; });
        var allVerified = required.length === 0 || required.every(function (d) { return d.status === "verified"; });
        var onboardingComplete = !!(user.name && user.name.trim()) && allVerified;
        if (!onboardingComplete) return { canSkipOtp: false };
        var token = (0, _token.signToken)({
          sub: user.riderId,
          phoneNumber: user.phoneNumber,
          name: user.name
        }, "28d");
        return {
          canSkipOtp: true,
          token: token,
          userId: user.riderId,
          name: user.name || null,
          phoneNumber: user.phoneNumber,
          onboardingComplete: true
        };
      })
      .catch(function () {
        return { canSkipOtp: false };
      });
  });
};

var resendOtpSignin = exports.resendOtpSignin = function resendOtpSignin(mobileNumber) {
  var mobile = String(mobileNumber).replace(/\D/g, "").trim();
  if (!mobile) return Promise.reject(new Error("mobileNumber is required"));

  return _Rider.Rider.findOne({ phoneNumber: mobile }).then(function (user) {
    if (!user) return Promise.reject(new Error("User not found"));
    var otp = mobile === TEST_MOBILE ? TEST_OTP : generateOTP();
    var expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    return sendSigninSms(mobile, otp).then(function (smsResult) {
      if (!smsResult.success) {
        if (smsResult.body) console.warn("[signin] SMS gateway failure (resend) — status:", smsResult.status, "body:", smsResult.body.substring(0, 200));
        return Promise.reject(new Error("Failed to send OTP via SMS"));
      }
      user.otp = otp;
      user.otpExpiry = expiry;
      return user.save().then(function () {
        return { message: "OTP resent successfully" };
      });
    });
  });
};
