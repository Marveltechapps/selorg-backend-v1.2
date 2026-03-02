"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.verifyOtp = exports.requestOtp = exports.refreshToken = exports.getProfile = void 0;
var _nodeCrypto = require("node:crypto");
var _env = require("../../config/env.js");
var _appConfig = require("../../config/appConfig.js");
var _token = require("../../utils/token.js");
var _Rider = require("../../models/Rider.js");
var _Otp = require("../../models/Otp.js");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t3 in e) "default" !== _t3 && {}.hasOwnProperty.call(e, _t3) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t3)) && (i.get || i.set) ? o(f, _t3, i) : f[_t3] = e[_t3]); return f; })(e, t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var generateOtpCode = function generateOtpCode() {
  return (0, _nodeCrypto.randomInt)(100000, 999999);
};
var sanitizePhoneNumber = function sanitizePhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^\d+]/g, "");
};
// Normalize phone for SMS gateway: digits only, any country code. Strip 00 prefix, then format.
var normalizePhoneForSms = function normalizePhoneForSms(phoneNumber) {
  var digits = String(phoneNumber).replace(/\D/g, "").replace(/^00+/, "");
  if (!digits || digits.length < 10) return digits;
  // India: 10 digits starting 6-9 -> 91 + digits; 11 with leading 0 -> 91 + rest; already 91... -> as is
  if (digits.length === 10 && /^[6-9]/.test(digits)) return "91" + digits;
  if (digits.length === 11 && digits.charAt(0) === "0") return "91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  // Any other country: use digits as-is (e.g. 44..., 1..., 33..., 971...)
  return digits;
};
// For Spear UC (India): gateway often delivers only when to_mobileno is 10 digits (no 91). Builtglory uses 10-digit.
var toGatewayNumber = function toGatewayNumber(normalized) {
  if (normalized.length === 12 && normalized.startsWith("91")) return normalized.slice(2);
  return normalized;
};
// Build SMS request: Spear UC (same as builtglory) expects to_mobileno and sms_text, GET request.
var buildSmsRequest = function buildSmsRequest(phoneNumber, code) {
  var base = (0, _appConfig.getSmsVendorUrl)();
  if (!base) return null;
  var toNumber = normalizePhoneForSms(phoneNumber);
  if (!toNumber || toNumber.length < 10) return null;
  var gatewayNumber = toGatewayNumber(toNumber);
  var message = "Your Selorg Rider verification code is ".concat(code, ". Do not share this OTP. - EVOLGN");
  var sep = base.includes("?") && !base.endsWith("&") && !base.endsWith("?") ? "&" : "";
  var urlWithParams = "".concat(base).concat(sep, "to_mobileno=").concat(encodeURIComponent(gatewayNumber), "&sms_text=").concat(encodeURIComponent(message));
  return { url: urlWithParams, toNumber: gatewayNumber, message: message };
};
var sendOtpSms = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(phoneNumber, code) {
    var req, response, body, _t;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          req = buildSmsRequest(phoneNumber, code);
          if (!req) {
            console.warn("[OTP] SMS vendor URL not configured (env or config.json smsvendor). OTP is only sent via SMS when smsvendor is set.");
            return _context.a(2, { sent: false, gatewayResponse: "No SMS vendor URL configured" });
          }
          _context.p = 1;
          _context.n = 2;
          return fetch(req.url);
        case 2:
          response = _context.v;
          _context.n = 3;
          return response.text()["catch"](function () {
            return "";
          });
        case 3:
          body = _context.v;
          if (response.ok) {
            var bodyLower = (body || "").toLowerCase();
            var looksFailed = /fail|error|invalid|denied|reject/.test(bodyLower) && !/success|sent|submit/.test(bodyLower);
            if (!looksFailed) {
              console.log("[OTP] SMS delivered to %s", phoneNumber);
              return _context.a(2, {
                sent: true,
                gatewayResponse: body
              });
            } else {
              console.error("[OTP] Gateway returned 200 but body suggests failure. Response:", body);
              return _context.a(2, {
                sent: false,
                gatewayResponse: body
              });
            }
          } else {
            console.error("[OTP] Failed to send SMS. Status:", response.status, "Response:", body);
            return _context.a(2, {
              sent: false,
              gatewayResponse: body
            });
          }
        case 4:
          _context.n = 6;
          break;
        case 5:
          _context.p = 5;
          _t = _context.v;
          console.error("[OTP] Error sending SMS:", _t);
          return _context.a(2, { sent: false, gatewayResponse: String(_t && _t.message || _t) });
        case 6:
          return _context.a(2);
      }
    }, _callee, null, [[1, 5]]);
  }));
  return function sendOtpSms(_x, _x2) {
    return _ref.apply(this, arguments);
  };
}();
var requestOtp = exports.requestOtp = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(phoneNumber) {
    var code, expiresAt, smsResult;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          code = generateOtpCode();
          expiresAt = new Date(Date.now() + _env.env.OTP_EXPIRY_MINUTES * 60 * 1000);
          _context2.n = 1;
          return _Otp.Otp.findOneAndUpdate({
            phoneNumber: phoneNumber
          }, {
            code: code,
            expiresAt: expiresAt,
            attempts: 0
          }, {
            upsert: true,
            "new": true,
            setDefaultsOnInsert: true
          });
        case 1:
          _context2.n = 2;
          return sendOtpSms(phoneNumber, code);
        case 2:
          smsResult = _context2.v;
          return _context2.a(2, {
            phoneNumber: phoneNumber,
            code: code,
            expiresAt: expiresAt.toISOString(),
            smsSent: smsResult && smsResult.sent === true,
            gatewayResponse: smsResult && smsResult.gatewayResponse
          });
      }
    }, _callee2);
  }));
  return function requestOtp(_x3) {
    return _ref2.apply(this, arguments);
  };
}();
var verifyOtp = exports.verifyOtp = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(phoneNumber, code, userType, deviceId, deviceName, ipAddress, userAgent) {
    var record, rider, lockoutMinutes, normalizedCode, _rider$mfa, _rider, _yield$import, createSession, session;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          _context3.n = 1;
          return _Otp.Otp.findOne({
            phoneNumber: phoneNumber
          });
        case 1:
          record = _context3.v;
          if (record) {
            _context3.n = 2;
            break;
          }
          throw new Error("OTP not requested or expired");
        case 2:
          if (!(new Date() > record.expiresAt)) {
            _context3.n = 4;
            break;
          }
          _context3.n = 3;
          return _Otp.Otp.deleteOne({
            phoneNumber: phoneNumber
          });
        case 3:
          throw new Error("OTP expired");
        case 4:
          if (!(userType === "rider")) {
            _context3.n = 7;
            break;
          }
          _context3.n = 5;
          return _Rider.Rider.findOne({
            phoneNumber: phoneNumber
          });
        case 5:
          rider = _context3.v;
          if (!rider) {
            _context3.n = 7;
            break;
          }
          if (!(rider.accountLockedUntil && new Date() < rider.accountLockedUntil)) {
            _context3.n = 6;
            break;
          }
          lockoutMinutes = Math.ceil((rider.accountLockedUntil.getTime() - Date.now()) / 60000);
          throw new Error("Account is locked due to too many failed attempts. Please try again in ".concat(lockoutMinutes, " minutes."));
        case 6:
          if (!(rider.accountLockedUntil && new Date() >= rider.accountLockedUntil)) {
            _context3.n = 7;
            break;
          }
          rider.accountLockedUntil = undefined;
          rider.failedLoginAttempts = 0;
          _context3.n = 7;
          return rider.save();
        case 7:
          normalizedCode = code.trim();
          if (!(record.code.toString() !== normalizedCode)) {
            _context3.n = 11;
            break;
          }
          record.attempts += 1;
          _context3.n = 8;
          return record.save();
        case 8:
          if (!(record.attempts >= 3)) {
            _context3.n = 10;
            break;
          }
          _context3.n = 9;
          return _Otp.Otp.deleteOne({
            phoneNumber: phoneNumber
          });
        case 9:
          throw new Error("Too many failed attempts. Please request a new OTP.");
        case 10:
          throw new Error("Invalid OTP code");
        case 11:
          _context3.n = 12;
          return _Otp.Otp.deleteOne({
            phoneNumber: phoneNumber
          });
        case 12:
          if (!(userType === "rider")) {
            _context3.n = 18;
            break;
          }
          _context3.n = 13;
          return _Rider.Rider.findOne({
            phoneNumber: phoneNumber
          });
        case 13:
          _rider = _context3.v;
          if (_rider) {
            _context3.n = 14;
            break;
          }
          throw new Error("Rider not found. Please register first.");
        case 14:
          // Reset failed login attempts on successful login
          _rider.failedLoginAttempts = 0;
          _rider.accountLockedUntil = undefined;
          _context3.n = 15;
          return _rider.save();
        case 15:
          _context3.n = 16;
          return Promise.resolve().then(function () {
            return _interopRequireWildcard(require("./session.service.js"));
          });
        case 16:
          _yield$import = _context3.v;
          createSession = _yield$import.createSession;
          _context3.n = 17;
          return createSession(_rider.riderId, deviceId || "unknown", deviceName || "Unknown Device", ipAddress || "unknown", userAgent || "unknown");
        case 17:
          session = _context3.v;
          return _context3.a(2, {
            tokens: {
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
              expiresIn: 7 * 24 * 60 * 60 // 7 days in seconds
            },
            riderId: _rider.riderId,
            phoneNumber: _rider.phoneNumber,
            name: _rider.name,
            status: _rider.status,
            sessionId: session.sessionId,
            mfaRequired: ((_rider$mfa = _rider.mfa) === null || _rider$mfa === void 0 ? void 0 : _rider$mfa.enabled) === true
          });
        case 18:
          throw new Error("Invalid user type");
        case 19:
          return _context3.a(2);
      }
    }, _callee3);
  }));
  return function verifyOtp(_x4, _x5, _x6, _x7, _x8, _x9, _x0) {
    return _ref3.apply(this, arguments);
  };
}();
var refreshToken = exports.refreshToken = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(_refreshToken) {
    var _yield$import2, verifyToken, payload, rider, newAccessToken, _t2;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.p = _context4.n) {
        case 0:
          _context4.p = 0;
          _context4.n = 1;
          return Promise.resolve().then(function () {
            return _interopRequireWildcard(require("../../utils/token.js"));
          });
        case 1:
          _yield$import2 = _context4.v;
          verifyToken = _yield$import2.verifyToken;
          payload = verifyToken(_refreshToken);
          _context4.n = 2;
          return _Rider.Rider.findOne({
            riderId: payload.sub
          });
        case 2:
          rider = _context4.v;
          if (rider) {
            _context4.n = 3;
            break;
          }
          throw new Error("Rider not found");
        case 3:
          newAccessToken = (0, _token.signToken)({
            sub: rider.riderId,
            phoneNumber: rider.phoneNumber,
            name: rider.name
          });
          return _context4.a(2, {
            accessToken: newAccessToken,
            refreshToken: _refreshToken
          });
        case 4:
          _context4.p = 4;
          _t2 = _context4.v;
          throw new Error("Invalid refresh token");
        case 5:
          return _context4.a(2);
      }
    }, _callee4, null, [[0, 4]]);
  }));
  return function refreshToken(_x1) {
    return _ref4.apply(this, arguments);
  };
}();
var getProfile = exports.getProfile = /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(phoneNumber) {
    var rider;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          _context5.n = 1;
          return _Rider.Rider.findOne({
            phoneNumber: phoneNumber
          });
        case 1:
          rider = _context5.v;
          if (rider) {
            _context5.n = 2;
            break;
          }
          return _context5.a(2, null);
        case 2:
          return _context5.a(2, {
            id: rider.riderId,
            phoneNumber: rider.phoneNumber,
            name: rider.name,
            email: rider.email,
            status: rider.status
          });
      }
    }, _callee5);
  }));
  return function getProfile(_x10) {
    return _ref5.apply(this, arguments);
  };
}();