"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.authRouter = void 0;
var _express = require("express");
var _zod = require("zod");
var _authenticate = require("../../middleware/authenticate.js");
var _rateLimiter = require("../../middleware/rateLimiter.js");
var _authService = require("./auth.service.js");
var _authSchema = require("./auth.schema.js");
var _riderService = require("../delivery/rider.service.js");
var _mfaService = require("./mfa.service.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var authRouter = exports.authRouter = (0, _express.Router)();

// Apply strict rate limiting to OTP endpoints
authRouter.post("/send-otp", _rateLimiter.otpLimiter, /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(req, res) {
    var parseResult, phoneNumber, placeholderName, otpResult;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          parseResult = _authSchema.requestOtpSchema.safeParse(req.body);
          if (parseResult.success) {
            _context.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context.a(2);
        case 1:
          phoneNumber = parseResult.data.phoneNumber;
          placeholderName = "Rider ".concat(phoneNumber.slice(-4));
          _context.n = 2;
          return (0, _riderService.createRider)({
            name: placeholderName,
            phoneNumber: phoneNumber,
            vehicleType: "bike"
          });
        case 2:
          _context.n = 3;
          return (0, _authService.requestOtp)(phoneNumber);
        case 3:
          otpResult = _context.v;
          res.json({
            success: true,
            message: otpResult.smsSent ? "OTP sent successfully" : "OTP may not have been delivered via SMS. Check that smsvendor is configured and try again.",
            sessionId: otpResult.expiresAt,
            expiresAt: otpResult.expiresAt,
            smsSent: otpResult.smsSent === true
          });
        case 4:
          return _context.a(2);
      }
    }, _callee);
  }));
  return function (_x, _x2) {
    return _ref.apply(this, arguments);
  };
}());
authRouter.post("/verify-otp", _rateLimiter.authLimiter, /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(req, res) {
    var parseResult, _parseResult$data, phoneNumber, code, userType, deviceId, deviceName, ipAddress, userAgent, result, _t;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.p = _context2.n) {
        case 0:
          parseResult = _authSchema.verifyOtpSchema.safeParse(req.body);
          if (parseResult.success) {
            _context2.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context2.a(2);
        case 1:
          _context2.p = 1;
          _parseResult$data = parseResult.data, phoneNumber = _parseResult$data.phoneNumber, code = _parseResult$data.code, userType = _parseResult$data.userType;
          deviceId = req.headers["x-device-id"];
          deviceName = req.headers["x-device-name"];
          ipAddress = req.ip || req.socket.remoteAddress || "unknown";
          userAgent = req.headers["user-agent"] || "unknown";
          _context2.n = 2;
          return (0, _authService.verifyOtp)(phoneNumber, code, userType, deviceId, deviceName, ipAddress, userAgent);
        case 2:
          result = _context2.v;
          res.json(_objectSpread({
            success: true,
            message: "Authentication successful"
          }, result));
          _context2.n = 4;
          break;
        case 3:
          _context2.p = 3;
          _t = _context2.v;
          if (_t instanceof Error) {
            res.status(400).json({
              error: _t.message
            });
          } else {
            res.status(400).json({
              error: "OTP verification failed"
            });
          }
        case 4:
          return _context2.a(2);
      }
    }, _callee2, null, [[1, 3]]);
  }));
  return function (_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
}());
authRouter.post("/refresh-token", _rateLimiter.authLimiter, /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(req, res) {
    var parseResult, token, result, _t2;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.p = _context3.n) {
        case 0:
          parseResult = _authSchema.refreshTokenSchema.safeParse(req.body);
          if (parseResult.success) {
            _context3.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context3.a(2);
        case 1:
          _context3.p = 1;
          token = parseResult.data.refreshToken;
          _context3.n = 2;
          return (0, _authService.refreshToken)(token);
        case 2:
          result = _context3.v;
          res.json(result);
          _context3.n = 4;
          break;
        case 3:
          _context3.p = 3;
          _t2 = _context3.v;
          if (_t2 instanceof Error) {
            res.status(401).json({
              error: _t2.message
            });
          } else {
            res.status(401).json({
              error: "Failed to refresh token"
            });
          }
        case 4:
          return _context3.a(2);
      }
    }, _callee3, null, [[1, 3]]);
  }));
  return function (_x5, _x6) {
    return _ref3.apply(this, arguments);
  };
}());
authRouter.post("/logout", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(_req, res) {
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.n) {
        case 0:
          // In a stateless JWT system, logout is handled client-side by removing the token
          // But we can add token blacklisting here if needed
          res.json({
            success: true,
            message: "Logged out successfully"
          });
        case 1:
          return _context4.a(2);
      }
    }, _callee4);
  }));
  return function (_x7, _x8) {
    return _ref4.apply(this, arguments);
  };
}());
authRouter.get("/me", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(req, res) {
    var profile;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          if (req.user) {
            _context5.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context5.a(2);
        case 1:
          _context5.n = 2;
          return (0, _authService.getProfile)(req.user.phoneNumber);
        case 2:
          profile = _context5.v;
          if (profile) {
            _context5.n = 3;
            break;
          }
          res.status(404).json({
            error: "Profile not found"
          });
          return _context5.a(2);
        case 3:
          res.json({
            profile: profile
          });
        case 4:
          return _context5.a(2);
      }
    }, _callee5);
  }));
  return function (_x9, _x0) {
    return _ref5.apply(this, arguments);
  };
}());

// MFA endpoints
var mfaSetupSchema = _zod.z.object({
  riderId: _zod.z.string()
});
var mfaVerifySchema = _zod.z.object({
  riderId: _zod.z.string(),
  token: _zod.z.string().length(6)
});
var mfaEnableSchema = _zod.z.object({
  riderId: _zod.z.string(),
  token: _zod.z.string().length(6)
});
var mfaDisableSchema = _zod.z.object({
  riderId: _zod.z.string(),
  token: _zod.z.string().length(6)
});
var mfaBackupCodeSchema = _zod.z.object({
  riderId: _zod.z.string(),
  code: _zod.z.string().min(8).max(10)
});

// Generate MFA secret and QR code
authRouter.post("/mfa/setup", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(req, res) {
    var parseResult, riderId, mfaSetup, _t3;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.p = _context6.n) {
        case 0:
          _context6.p = 0;
          if (req.user) {
            _context6.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context6.a(2);
        case 1:
          parseResult = mfaSetupSchema.safeParse({
            riderId: req.user.id
          });
          if (parseResult.success) {
            _context6.n = 2;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context6.a(2);
        case 2:
          riderId = parseResult.data.riderId;
          _context6.n = 3;
          return (0, _mfaService.generateMFASecret)(riderId);
        case 3:
          mfaSetup = _context6.v;
          res.json(_objectSpread({
            success: true
          }, mfaSetup));
          _context6.n = 5;
          break;
        case 4:
          _context6.p = 4;
          _t3 = _context6.v;
          if (_t3 instanceof Error) {
            res.status(400).json({
              error: _t3.message
            });
          } else {
            res.status(400).json({
              error: "Failed to setup MFA"
            });
          }
        case 5:
          return _context6.a(2);
      }
    }, _callee6, null, [[0, 4]]);
  }));
  return function (_x1, _x10) {
    return _ref6.apply(this, arguments);
  };
}());

// Verify TOTP token (before enabling)
authRouter.post("/mfa/verify", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7(req, res) {
    var parseResult, _parseResult$data2, riderId, token, isValid, _t4;
    return _regenerator().w(function (_context7) {
      while (1) switch (_context7.p = _context7.n) {
        case 0:
          _context7.p = 0;
          if (req.user) {
            _context7.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context7.a(2);
        case 1:
          parseResult = mfaVerifySchema.safeParse(_objectSpread(_objectSpread({}, req.body), {}, {
            riderId: req.user.id
          }));
          if (parseResult.success) {
            _context7.n = 2;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context7.a(2);
        case 2:
          _parseResult$data2 = parseResult.data, riderId = _parseResult$data2.riderId, token = _parseResult$data2.token;
          _context7.n = 3;
          return (0, _mfaService.verifyTOTP)(riderId, token);
        case 3:
          isValid = _context7.v;
          if (isValid) {
            _context7.n = 4;
            break;
          }
          res.status(400).json({
            error: "Invalid TOTP token"
          });
          return _context7.a(2);
        case 4:
          res.json({
            success: true,
            message: "TOTP token verified"
          });
          _context7.n = 6;
          break;
        case 5:
          _context7.p = 5;
          _t4 = _context7.v;
          if (_t4 instanceof Error) {
            res.status(400).json({
              error: _t4.message
            });
          } else {
            res.status(400).json({
              error: "Failed to verify TOTP"
            });
          }
        case 6:
          return _context7.a(2);
      }
    }, _callee7, null, [[0, 5]]);
  }));
  return function (_x11, _x12) {
    return _ref7.apply(this, arguments);
  };
}());

// Enable MFA
authRouter.post("/mfa/enable", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref8 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8(req, res) {
    var parseResult, _parseResult$data3, riderId, token, _t5;
    return _regenerator().w(function (_context8) {
      while (1) switch (_context8.p = _context8.n) {
        case 0:
          _context8.p = 0;
          if (req.user) {
            _context8.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context8.a(2);
        case 1:
          parseResult = mfaEnableSchema.safeParse(_objectSpread(_objectSpread({}, req.body), {}, {
            riderId: req.user.id
          }));
          if (parseResult.success) {
            _context8.n = 2;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context8.a(2);
        case 2:
          _parseResult$data3 = parseResult.data, riderId = _parseResult$data3.riderId, token = _parseResult$data3.token;
          _context8.n = 3;
          return (0, _mfaService.enableMFA)(riderId, token);
        case 3:
          res.json({
            success: true,
            message: "MFA enabled successfully"
          });
          _context8.n = 5;
          break;
        case 4:
          _context8.p = 4;
          _t5 = _context8.v;
          if (_t5 instanceof Error) {
            res.status(400).json({
              error: _t5.message
            });
          } else {
            res.status(400).json({
              error: "Failed to enable MFA"
            });
          }
        case 5:
          return _context8.a(2);
      }
    }, _callee8, null, [[0, 4]]);
  }));
  return function (_x13, _x14) {
    return _ref8.apply(this, arguments);
  };
}());

// Disable MFA
authRouter.post("/mfa/disable", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref9 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9(req, res) {
    var parseResult, _parseResult$data4, riderId, token, _t6;
    return _regenerator().w(function (_context9) {
      while (1) switch (_context9.p = _context9.n) {
        case 0:
          _context9.p = 0;
          if (req.user) {
            _context9.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context9.a(2);
        case 1:
          parseResult = mfaDisableSchema.safeParse(_objectSpread(_objectSpread({}, req.body), {}, {
            riderId: req.user.id
          }));
          if (parseResult.success) {
            _context9.n = 2;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context9.a(2);
        case 2:
          _parseResult$data4 = parseResult.data, riderId = _parseResult$data4.riderId, token = _parseResult$data4.token;
          _context9.n = 3;
          return (0, _mfaService.disableMFA)(riderId, token);
        case 3:
          res.json({
            success: true,
            message: "MFA disabled successfully"
          });
          _context9.n = 5;
          break;
        case 4:
          _context9.p = 4;
          _t6 = _context9.v;
          if (_t6 instanceof Error) {
            res.status(400).json({
              error: _t6.message
            });
          } else {
            res.status(400).json({
              error: "Failed to disable MFA"
            });
          }
        case 5:
          return _context9.a(2);
      }
    }, _callee9, null, [[0, 4]]);
  }));
  return function (_x15, _x16) {
    return _ref9.apply(this, arguments);
  };
}());

// Check if MFA is enabled
authRouter.get("/mfa/status", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref0 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0(req, res) {
    var enabled, _t7;
    return _regenerator().w(function (_context0) {
      while (1) switch (_context0.p = _context0.n) {
        case 0:
          _context0.p = 0;
          if (req.user) {
            _context0.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context0.a(2);
        case 1:
          _context0.n = 2;
          return (0, _mfaService.isMFAEnabled)(req.user.id);
        case 2:
          enabled = _context0.v;
          res.json({
            enabled: enabled
          });
          _context0.n = 4;
          break;
        case 3:
          _context0.p = 3;
          _t7 = _context0.v;
          if (_t7 instanceof Error) {
            res.status(400).json({
              error: _t7.message
            });
          } else {
            res.status(400).json({
              error: "Failed to check MFA status"
            });
          }
        case 4:
          return _context0.a(2);
      }
    }, _callee0, null, [[0, 3]]);
  }));
  return function (_x17, _x18) {
    return _ref0.apply(this, arguments);
  };
}());

// Verify backup code
authRouter.post("/mfa/verify-backup", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref1 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee1(req, res) {
    var parseResult, _parseResult$data5, riderId, code, isValid, _t8;
    return _regenerator().w(function (_context1) {
      while (1) switch (_context1.p = _context1.n) {
        case 0:
          _context1.p = 0;
          if (req.user) {
            _context1.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context1.a(2);
        case 1:
          parseResult = mfaBackupCodeSchema.safeParse(_objectSpread(_objectSpread({}, req.body), {}, {
            riderId: req.user.id
          }));
          if (parseResult.success) {
            _context1.n = 2;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context1.a(2);
        case 2:
          _parseResult$data5 = parseResult.data, riderId = _parseResult$data5.riderId, code = _parseResult$data5.code;
          _context1.n = 3;
          return (0, _mfaService.verifyBackupCode)(riderId, code);
        case 3:
          isValid = _context1.v;
          if (isValid) {
            _context1.n = 4;
            break;
          }
          res.status(400).json({
            error: "Invalid backup code"
          });
          return _context1.a(2);
        case 4:
          res.json({
            success: true,
            message: "Backup code verified"
          });
          _context1.n = 6;
          break;
        case 5:
          _context1.p = 5;
          _t8 = _context1.v;
          if (_t8 instanceof Error) {
            res.status(400).json({
              error: _t8.message
            });
          } else {
            res.status(400).json({
              error: "Failed to verify backup code"
            });
          }
        case 6:
          return _context1.a(2);
      }
    }, _callee1, null, [[0, 5]]);
  }));
  return function (_x19, _x20) {
    return _ref1.apply(this, arguments);
  };
}());