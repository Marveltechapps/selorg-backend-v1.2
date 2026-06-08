"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resendOtpSignin = exports.verifyOtpSignin = exports.verifyOtpEmailSignin = exports.sendOtpEmailSignin = exports.sendOtpSignin = void 0;

var _appConfig = require("../../config/appConfig.js");
var _token = require("../../utils/token.js");
var _Rider = require("../../models/Rider.js");
var _riderService = require("../delivery/rider.service.js");
var _kycService = require("../kyc/kyc.service.js");
var crypto = require("crypto");

function normalizeEmailAddress(email) {
  var e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function syntheticPhoneFromEmail(email) {
  var hex = crypto.createHash("md5").update(String(email).toLowerCase()).digest("hex");
  var digits = hex.replace(/[a-f]/gi, "").slice(0, 9);
  return "1" + digits.padEnd(9, "0");
}

function isSyntheticPhoneNumber(phone) {
  var digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 10 && digits.charAt(0) === "1";
}

var _profileValidation = require("../../utils/profileDetails.validation.js");

function phoneLookupQuery(phone) {
  var digits = _profileValidation.normalizePhoneDigits(phone);
  if (!digits) return { phoneNumber: String(phone || "") };
  var e164 = _profileValidation.formatPhoneE164(digits);
  var variants = [String(phone), digits, e164, "+91" + digits].filter(function (v, i, arr) {
    return v && arr.indexOf(v) === i;
  });
  return { phoneNumber: { $in: variants } };
}

function publicPhoneNumber(phone) {
  return isSyntheticPhoneNumber(phone) ? null : phone;
}

function loadPickerSmsService() {
  try {
    return require("../../../../picker/services/sms.service");
  } catch (_) {
    return null;
  }
}

function loadPickerEmailService() {
  try {
    return require("../../../../picker/services/emailOtp.service");
  } catch (_) {
    return null;
  }
}

function deliverOtpToPhone(mobile, otp, preferredChannel) {
  var channel = String(preferredChannel || "sms").toLowerCase();
  var wantsWhatsApp = channel === "whatsapp";
  var pickerSms = loadPickerSmsService();

  function finishFromRiderSms(smsResult) {
    return {
      success: !!smsResult.success,
      channel: smsResult.success ? "sms" : undefined,
      body: smsResult.body,
      status: smsResult.status,
    };
  }

  function tryRiderSms() {
    return sendSigninSms(mobile, otp).then(finishFromRiderSms);
  }

  function tryPickerSms() {
    if (pickerSms && typeof pickerSms.sendOtpSms === "function") {
      return pickerSms.sendOtpSms(mobile, otp).then(function (result) {
        if (result && result.sent) {
          return { success: true, channel: result.channel || "sms" };
        }
        return tryRiderSms();
      });
    }
    return tryRiderSms();
  }

  if (wantsWhatsApp && pickerSms && typeof pickerSms.sendOtpWhatsApp === "function") {
    return deliverOtpWithRiderBranding(function () {
      return pickerSms.sendOtpWhatsApp(mobile, otp).then(function (result) {
        if (result && result.sent) {
          return { success: true, channel: result.channel || "whatsapp" };
        }
        return tryPickerSms();
      });
    });
  }

  return deliverOtpWithRiderBranding(function () {
    return tryPickerSms();
  });
}

var RIDER_APP_NAME = process.env.RIDER_APP_NAME || "Selorg Rider";
var RIDER_OTP_MESSAGE =
  process.env.RIDER_OTP_WHATSAPP_MESSAGE ||
  process.env.RIDER_OTP_SMS_MESSAGE ||
  "Selorg Rider verification code is {otp}. Valid for 5 minutes. Do not share.";

function riderEmailFromAddress() {
  return (
    process.env.RIDER_RESEND_FROM ||
    process.env.RIDER_EMAIL_FROM ||
    process.env.RIDER_RESEND_VERIFIED_FROM ||
    null
  );
}

function deliverOtpWithRiderBranding(promiseFactory) {
  var pickerSms = loadPickerSmsService();
  if (pickerSms && typeof pickerSms.withOtpMessageTemplate === "function") {
    return pickerSms.withOtpMessageTemplate(RIDER_OTP_MESSAGE, promiseFactory);
  }
  return promiseFactory();
}

function sendOtpEmailDelivery(email, otp) {
  var pickerEmail = loadPickerEmailService();
  if (pickerEmail && typeof pickerEmail.sendPickerEmailOtp === "function" && pickerEmail.isEmailOtpConfigured && pickerEmail.isEmailOtpConfigured()) {
    return pickerEmail.sendPickerEmailOtp({
      to: email,
      otp: otp,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      appName: RIDER_APP_NAME,
      from: riderEmailFromAddress() || undefined,
    }).then(function (result) {
      return { success: !!(result && result.sent), channel: (result && result.channel) || "email" };
    });
  }
  if (process.env.NODE_ENV === "development") {
    console.info("\x1b[36m%s\x1b[0m", "----------------------------------------");
    console.info("\x1b[36m%s\x1b[0m", "DEVELOPMENT RIDER EMAIL OTP");
    console.info("\x1b[36m%s\x1b[0m", "Email: " + email);
    console.info("\x1b[36m%s\x1b[0m", "OTP: " + otp);
    console.info("\x1b[36m%s\x1b[0m", "----------------------------------------");
    return Promise.resolve({ success: true, channel: "email" });
  }
  return Promise.resolve({ success: false, channel: "email" });
}

// OTP process per OTP_PROCESS_WORKFLOW.md
var OTP_EXPIRY_MINUTES = 5;
// Default name for new riders from createRider; only treat as onboarding-complete when user has a real name
var DEFAULT_NAME_REGEX = /^Rider\s+\d{4}$/;

var hasCompletedOnboarding = function (user, documents) {
  if (!user.name || !String(user.name).trim()) return false;
  if (DEFAULT_NAME_REGEX.test(String(user.name).trim())) return false;
  if (!user.preferredLocation || !user.preferredLocation.cityId || !user.preferredLocation.hubId) return false;
  if (!user.vehicle || !user.vehicle.type || !user.vehicle.registrationNumber) return false;
  if (!user.profilePicture) return false;
  
  var required = (documents || []).filter(function (d) { return d.required; });
  var allVerified = required.length > 0 && required.every(function (d) { return ["verified", "pending"].includes(d.status); });
  return allVerified;
};

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
  var sep = base.includes("?") && !base.endsWith("&") && !base.endsWith("?") ? "&" : "";
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

var sendOtpSignin = exports.sendOtpSignin = function sendOtpSignin(mobileNumber, options) {
  var digits = String(mobileNumber).replace(/\D/g, "").trim();
  var mobile = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 10 ? digits : digits.slice(-10);
  if (mobile.length !== 10 || /^0+$/.test(mobile)) {
    return Promise.reject(new Error("Invalid mobile number"));
  }
  var preferredChannel = options && options.preferredChannel ? String(options.preferredChannel).toLowerCase() : "sms";
  var otp = mobile === TEST_MOBILE ? TEST_OTP : generateOTP();
  var expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  if (process.env.NODE_ENV === "development") {
    console.info("\x1b[36m%s\x1b[0m", "----------------------------------------");
    console.info("\x1b[36m%s\x1b[0m", "DEVELOPMENT OTP LOG (" + preferredChannel + ")");
    console.info("\x1b[36m%s\x1b[0m", "Mobile: " + mobile);
    console.info("\x1b[36m%s\x1b[0m", "OTP: " + otp);
    console.info("\x1b[36m%s\x1b[0m", "----------------------------------------");
  }

  return (0, _riderService.createRider)({
    name: "Rider " + mobile.slice(-4),
    phoneNumber: mobile,
    vehicleType: "bike"
  }).then(function (_ref) {
    var rider = _ref.rider;
    rider.otp = otp;
    rider.otpExpiry = expiry;
    return rider.save().then(function () {
      return new Promise(function (resolve) {
        var settled = false;
        var timer = setTimeout(function () {
          if (!settled) {
            settled = true;
            resolve({ channel: preferredChannel });
          }
        }, 10000);
        deliverOtpToPhone(mobile, otp, preferredChannel)
          .then(function (deliveryResult) {
            if (!deliveryResult.success) {
              if (deliveryResult.body) {
                console.warn(
                  "[signin] OTP delivery failure — status:",
                  deliveryResult.status,
                  "body:",
                  String(deliveryResult.body).substring(0, 200)
                );
              }
              if (process.env.NODE_ENV === "development") {
                console.info("\x1b[33m%s\x1b[0m", "DEVELOPMENT OTP BYPASS (DELIVERY FAILED)");
                console.info("\x1b[33m%s\x1b[0m", "Mobile: " + mobile);
                console.info("\x1b[33m%s\x1b[0m", "OTP: " + otp);
              } else {
                console.warn("[signin] OTP saved but delivery failed for " + mobile + " via " + preferredChannel);
              }
            }
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve({ channel: (deliveryResult && deliveryResult.channel) || preferredChannel });
            }
          })
          .catch(function (err) {
            console.warn("[signin] OTP delivery error:", err && err.message ? err.message : err);
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve({ channel: preferredChannel });
            }
          });
      }).then(function (meta) {
        return {
          success: true,
          message: "OTP sent successfully" + (process.env.NODE_ENV === "development" ? " (check backend console)" : ""),
          channel: meta.channel || preferredChannel,
        };
      });
    });
  });
};

var sendOtpEmailSignin = exports.sendOtpEmailSignin = function sendOtpEmailSignin(emailAddress) {
  var email = normalizeEmailAddress(emailAddress);
  if (!email) {
    return Promise.reject(new Error("Please enter a valid email address"));
  }
  var otp = generateOTP();
  var expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  return _Rider.Rider.findOne({ email: email }).then(function (existing) {
    if (existing) return existing;
    var syntheticPhone = syntheticPhoneFromEmail(email);
    return (0, _riderService.createRider)({
      name: "Rider " + email.split("@")[0].slice(0, 8),
      phoneNumber: syntheticPhone,
      email: email,
      vehicleType: "bike"
    }).then(function (result) {
      return result.rider;
    });
  }).then(function (rider) {
    rider.email = email;
    rider.otp = otp;
    rider.otpExpiry = expiry;
    return rider.save().then(function () {
      sendOtpEmailDelivery(email, otp).catch(function (err) {
        console.warn("[signin] email OTP delivery error:", err && err.message ? err.message : err);
      });
      return {
        success: true,
        message: "OTP sent successfully" + (process.env.NODE_ENV === "development" ? " (check backend console)" : ""),
        channel: "email",
      };
    });
  });
};

var verifyOtpEmailSignin = exports.verifyOtpEmailSignin = function verifyOtpEmailSignin(emailAddress, enteredOTP) {
  var email = normalizeEmailAddress(emailAddress);
  var otpInput = (enteredOTP != null ? String(enteredOTP) : "").trim();
  if (!email) return Promise.reject(new Error("Please enter a valid email address"));
  if (!otpInput) return Promise.reject(new Error("email and otp are required"));

  return _Rider.Rider.findOne({ email: email }).then(function (user) {
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
        name: user.name,
        email: user.email,
      }, "28d");
      return (0, _kycService.getUserStatus)(user.riderId)
        .then(function (documents) {
          var onboardingComplete = hasCompletedOnboarding(user, documents);
          var isNewUser = !onboardingComplete;
          return {
            success: true,
            message: "OTP verified successfully",
            riderId: user.riderId,
            token: token,
            isVerified: user.isVerified,
            name: user.name || null,
            email: user.email || email,
            phoneNumber: publicPhoneNumber(user.phoneNumber),
            loginMethod: "email",
            onboardingComplete: onboardingComplete,
            isNewUser: isNewUser,
          };
        })
        .catch(function () {
          return {
            success: true,
            message: "OTP verified successfully",
            riderId: user.riderId,
            token: token,
            isVerified: user.isVerified,
            name: user.name || null,
            email: user.email || email,
            phoneNumber: publicPhoneNumber(user.phoneNumber),
            loginMethod: "email",
            onboardingComplete: false,
            isNewUser: true,
          };
        });
    });
  });
};

var verifyOtpSignin = exports.verifyOtpSignin = function verifyOtpSignin(mobileNumber, enteredOTP, options) {
  var mobile = String(mobileNumber).replace(/\D/g, "").trim();
  var otpInput = (enteredOTP != null ? String(enteredOTP) : "").trim();
  if (!mobile || !otpInput) {
    return Promise.reject(new Error("mobileNumber and otp are required"));
  }
  var preferredChannel = options && options.preferredChannel ? String(options.preferredChannel).toLowerCase() : "sms";
  var loginMethod = preferredChannel === "whatsapp" ? "whatsapp" : "mobile";

  return _Rider.Rider.findOne(phoneLookupQuery(mobile)).then(function (user) {
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
        name: user.name,
        email: user.email,
      }, "28d");
      return (0, _kycService.getUserStatus)(user.riderId)
        .then(function (documents) {
          var onboardingComplete = hasCompletedOnboarding(user, documents);
          return {
            success: true,
            message: "OTP verified successfully",
            riderId: user.riderId,
            token: token,
            isVerified: user.isVerified,
            name: user.name || null,
            email: user.email || null,
            phoneNumber: user.phoneNumber,
            loginMethod: loginMethod,
            onboardingComplete: onboardingComplete,
            isNewUser: !onboardingComplete,
          };
        })
        .catch(function () {
          return {
            success: true,
            message: "OTP verified successfully",
            riderId: user.riderId,
            token: token,
            isVerified: user.isVerified,
            name: user.name || null,
            email: user.email || null,
            phoneNumber: user.phoneNumber,
            loginMethod: loginMethod,
            onboardingComplete: false,
            isNewUser: true,
          };
        });
    });
  });
};

// Existing user: if registered and onboarding complete, return token so app can skip OTP and go to dashboard
var existingUserLogin = exports.existingUserLogin = function existingUserLogin(mobileNumber) {
  var mobile = String(mobileNumber).replace(/\D/g, "").trim();
  if (!mobile || mobile.length !== 10) return Promise.reject(new Error("mobileNumber must be 10 digits"));

  return _Rider.Rider.findOne(phoneLookupQuery(mobile)).then(function (user) {
    if (!user) return Promise.resolve({ canSkipOtp: false });
    if (user.status === "deleted") return Promise.resolve({ canSkipOtp: false });
    return (0, _kycService.getUserStatus)(user.riderId)
      .then(function (documents) {
        var onboardingComplete = hasCompletedOnboarding(user, documents);
        if (!onboardingComplete) return { canSkipOtp: false };
        var token = (0, _token.signToken)({
          sub: user.riderId,
          phoneNumber: user.phoneNumber,
          name: user.name
        }, "28d");
        return {
          canSkipOtp: true,
          token: token,
          riderId: user.riderId,
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

var resendOtpSignin = exports.resendOtpSignin = function resendOtpSignin(mobileNumber, options) {
  var mobile = String(mobileNumber).replace(/\D/g, "").trim();
  if (!mobile) return Promise.reject(new Error("mobileNumber is required"));
  var preferredChannel = options && options.preferredChannel ? String(options.preferredChannel).toLowerCase() : "sms";

  return _Rider.Rider.findOne(phoneLookupQuery(mobile)).then(function (user) {
    if (!user) return Promise.reject(new Error("User not found"));
    var otp = mobile === TEST_MOBILE ? TEST_OTP : generateOTP();
    var expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = expiry;
    return user.save().then(function () {
      deliverOtpToPhone(mobile, otp, preferredChannel)
        .then(function (deliveryResult) {
          if (!deliveryResult.success && process.env.NODE_ENV !== "development") {
            console.warn("[signin] OTP resent but delivery may have failed for " + mobile);
          }
        })
        .catch(function (err) {
          console.warn("[signin] OTP resend delivery error:", err && err.message ? err.message : err);
        });
      return {
        success: true,
        message: "OTP resent successfully" + (process.env.NODE_ENV === "development" ? " (check backend console)" : ""),
        channel: preferredChannel,
      };
    });
  });
};
