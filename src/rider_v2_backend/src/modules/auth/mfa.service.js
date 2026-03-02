"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.verifyTOTP = exports.verifyBackupCode = exports.isMFAEnabled = exports.generateMFASecret = exports.enableMFA = exports.disableMFA = void 0;
var _speakeasy = _interopRequireDefault(require("speakeasy"));
var _qrcode = _interopRequireDefault(require("qrcode"));
var _Rider = require("../../models/Rider.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
/**
 * Generate MFA secret for a rider
 */
var generateMFASecret = exports.generateMFASecret = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(riderId) {
    var rider, secret, qrCodeUrl, backupCodes;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          _context.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context.v;
          if (rider) {
            _context.n = 2;
            break;
          }
          throw new Error("Rider not found");
        case 2:
          // Generate secret
          secret = _speakeasy["default"].generateSecret({
            name: "Rider App (".concat(rider.phoneNumber, ")"),
            issuer: "Rider App",
            length: 32
          }); // Generate QR code
          _context.n = 3;
          return _qrcode["default"].toDataURL(secret.otpauth_url || "");
        case 3:
          qrCodeUrl = _context.v;
          // Generate backup codes (10 codes)
          backupCodes = Array.from({
            length: 10
          }, function () {
            return Math.random().toString(36).substring(2, 10).toUpperCase();
          }); // Store secret temporarily (encrypted) - in production, use proper encryption
          // For now, we'll store it in the rider document
          if (!rider.mfa) {
            rider.mfa = {
              enabled: false,
              secret: secret.base32 || "",
              backupCodes: backupCodes.map(function (code) {
                return {
                  code: code,
                  used: false
                };
              })
            };
          } else {
            rider.mfa.secret = secret.base32 || "";
            rider.mfa.backupCodes = backupCodes.map(function (code) {
              return {
                code: code,
                used: false
              };
            });
          }
          _context.n = 4;
          return rider.save();
        case 4:
          return _context.a(2, {
            secret: secret.base32 || "",
            qrCodeUrl: qrCodeUrl,
            backupCodes: backupCodes
          });
      }
    }, _callee);
  }));
  return function generateMFASecret(_x) {
    return _ref.apply(this, arguments);
  };
}();

/**
 * Verify TOTP token
 */
var verifyTOTP = exports.verifyTOTP = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(riderId, token) {
    var rider, verified;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          _context2.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context2.v;
          if (!(!rider || !rider.mfa || !rider.mfa.enabled || !rider.mfa.secret)) {
            _context2.n = 2;
            break;
          }
          throw new Error("MFA not enabled for this rider");
        case 2:
          verified = _speakeasy["default"].totp.verify({
            secret: rider.mfa.secret,
            encoding: "base32",
            token: token,
            window: 2 // Allow 2 time steps (60 seconds) of tolerance
          });
          return _context2.a(2, verified);
      }
    }, _callee2);
  }));
  return function verifyTOTP(_x2, _x3) {
    return _ref2.apply(this, arguments);
  };
}();

/**
 * Verify backup code
 */
var verifyBackupCode = exports.verifyBackupCode = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(riderId, code) {
    var rider, backupCode;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          _context3.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context3.v;
          if (!(!rider || !rider.mfa || !rider.mfa.enabled || !rider.mfa.backupCodes)) {
            _context3.n = 2;
            break;
          }
          throw new Error("MFA not enabled for this rider");
        case 2:
          backupCode = rider.mfa.backupCodes.find(function (bc) {
            return bc.code === code.toUpperCase() && !bc.used;
          });
          if (backupCode) {
            _context3.n = 3;
            break;
          }
          return _context3.a(2, false);
        case 3:
          // Mark backup code as used
          backupCode.used = true;
          _context3.n = 4;
          return rider.save();
        case 4:
          return _context3.a(2, true);
      }
    }, _callee3);
  }));
  return function verifyBackupCode(_x4, _x5) {
    return _ref3.apply(this, arguments);
  };
}();

/**
 * Enable MFA for a rider (after verification)
 */
var enableMFA = exports.enableMFA = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(riderId, token) {
    var isValid, rider;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.n) {
        case 0:
          _context4.n = 1;
          return verifyTOTP(riderId, token);
        case 1:
          isValid = _context4.v;
          if (isValid) {
            _context4.n = 2;
            break;
          }
          throw new Error("Invalid TOTP token");
        case 2:
          _context4.n = 3;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 3:
          rider = _context4.v;
          if (!(!rider || !rider.mfa)) {
            _context4.n = 4;
            break;
          }
          throw new Error("MFA not set up");
        case 4:
          rider.mfa.enabled = true;
          _context4.n = 5;
          return rider.save();
        case 5:
          return _context4.a(2);
      }
    }, _callee4);
  }));
  return function enableMFA(_x6, _x7) {
    return _ref4.apply(this, arguments);
  };
}();

/**
 * Disable MFA for a rider
 */
var disableMFA = exports.disableMFA = /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(riderId, token) {
    var rider, isValid;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          _context5.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context5.v;
          if (!(!rider || !rider.mfa || !rider.mfa.enabled)) {
            _context5.n = 2;
            break;
          }
          throw new Error("MFA not enabled");
        case 2:
          _context5.n = 3;
          return verifyTOTP(riderId, token);
        case 3:
          isValid = _context5.v;
          if (isValid) {
            _context5.n = 4;
            break;
          }
          throw new Error("Invalid TOTP token");
        case 4:
          rider.mfa.enabled = false;
          rider.mfa.secret = "";
          rider.mfa.backupCodes = [];
          _context5.n = 5;
          return rider.save();
        case 5:
          return _context5.a(2);
      }
    }, _callee5);
  }));
  return function disableMFA(_x8, _x9) {
    return _ref5.apply(this, arguments);
  };
}();

/**
 * Check if MFA is enabled for a rider
 */
var isMFAEnabled = exports.isMFAEnabled = /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(riderId) {
    var _rider$mfa;
    var rider;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.n) {
        case 0:
          _context6.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context6.v;
          return _context6.a(2, (rider === null || rider === void 0 || (_rider$mfa = rider.mfa) === null || _rider$mfa === void 0 ? void 0 : _rider$mfa.enabled) === true);
      }
    }, _callee6);
  }));
  return function isMFAEnabled(_x0) {
    return _ref6.apply(this, arguments);
  };
}();