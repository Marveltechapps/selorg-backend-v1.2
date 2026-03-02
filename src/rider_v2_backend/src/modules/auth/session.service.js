"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.updateSessionActivity = exports.rotateSessionToken = exports.revokeSession = exports.revokeAllSessions = exports.getActiveSessions = exports.createSession = void 0;
var _Rider = require("../../models/Rider.js");
var _token = require("../../utils/token.js");
var _uuid = require("uuid");
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var MAX_CONCURRENT_SESSIONS = 5;
var SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create a new session for a rider
 */
var createSession = exports.createSession = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(riderId, deviceId, deviceName, ipAddress, userAgent) {
    var rider, sessionId, now, newSession, accessToken, refreshToken;
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
          sessionId = (0, _uuid.v4)();
          now = new Date(); // Initialize sessions array if it doesn't exist
          if (!rider.sessions) {
            rider.sessions = [];
          }

          // Remove expired sessions
          rider.sessions = rider.sessions.filter(function (session) {
            return now.getTime() - session.lastActivity.getTime() < SESSION_TIMEOUT_MS;
          });

          // Enforce max concurrent sessions
          if (rider.sessions.length >= MAX_CONCURRENT_SESSIONS) {
            // Remove oldest session
            rider.sessions.sort(function (a, b) {
              return a.lastActivity.getTime() - b.lastActivity.getTime();
            });
            rider.sessions.shift();
          }

          // Create new session
          newSession = {
            sessionId: sessionId,
            deviceId: deviceId,
            deviceName: deviceName,
            ipAddress: ipAddress,
            userAgent: userAgent,
            createdAt: now,
            lastActivity: now
          };
          rider.sessions.push(newSession);
          _context.n = 3;
          return rider.save();
        case 3:
          // Generate tokens
          accessToken = (0, _token.signToken)({
            sub: rider.riderId,
            phoneNumber: rider.phoneNumber,
            name: rider.name,
            sessionId: sessionId
          });
          refreshToken = (0, _token.signToken)({
            sub: rider.riderId,
            phoneNumber: rider.phoneNumber,
            sessionId: sessionId
          }, "30d");
          return _context.a(2, {
            sessionId: sessionId,
            accessToken: accessToken,
            refreshToken: refreshToken
          });
      }
    }, _callee);
  }));
  return function createSession(_x, _x2, _x3, _x4, _x5) {
    return _ref.apply(this, arguments);
  };
}();

/**
 * Update session activity
 */
var updateSessionActivity = exports.updateSessionActivity = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(riderId, sessionId) {
    var rider, session;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          _context2.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context2.v;
          if (!(!rider || !rider.sessions)) {
            _context2.n = 2;
            break;
          }
          return _context2.a(2);
        case 2:
          session = rider.sessions.find(function (s) {
            return s.sessionId === sessionId;
          });
          if (!session) {
            _context2.n = 3;
            break;
          }
          session.lastActivity = new Date();
          _context2.n = 3;
          return rider.save();
        case 3:
          return _context2.a(2);
      }
    }, _callee2);
  }));
  return function updateSessionActivity(_x6, _x7) {
    return _ref2.apply(this, arguments);
  };
}();

/**
 * Revoke a session
 */
var revokeSession = exports.revokeSession = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(riderId, sessionId) {
    var rider;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          _context3.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context3.v;
          if (!(!rider || !rider.sessions)) {
            _context3.n = 2;
            break;
          }
          return _context3.a(2);
        case 2:
          rider.sessions = rider.sessions.filter(function (s) {
            return s.sessionId !== sessionId;
          });
          _context3.n = 3;
          return rider.save();
        case 3:
          return _context3.a(2);
      }
    }, _callee3);
  }));
  return function revokeSession(_x8, _x9) {
    return _ref3.apply(this, arguments);
  };
}();

/**
 * Revoke all sessions for a rider
 */
var revokeAllSessions = exports.revokeAllSessions = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(riderId) {
    var rider;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.n) {
        case 0:
          _context4.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context4.v;
          if (rider) {
            _context4.n = 2;
            break;
          }
          return _context4.a(2);
        case 2:
          rider.sessions = [];
          _context4.n = 3;
          return rider.save();
        case 3:
          return _context4.a(2);
      }
    }, _callee4);
  }));
  return function revokeAllSessions(_x0) {
    return _ref4.apply(this, arguments);
  };
}();

/**
 * Get all active sessions for a rider
 */
var getActiveSessions = exports.getActiveSessions = /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(riderId) {
    var rider, now;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          _context5.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context5.v;
          if (!(!rider || !rider.sessions)) {
            _context5.n = 2;
            break;
          }
          return _context5.a(2, []);
        case 2:
          now = new Date();
          return _context5.a(2, rider.sessions.filter(function (session) {
            return now.getTime() - session.lastActivity.getTime() < SESSION_TIMEOUT_MS;
          }));
      }
    }, _callee5);
  }));
  return function getActiveSessions(_x1) {
    return _ref5.apply(this, arguments);
  };
}();

/**
 * Rotate session token (for security)
 */
var rotateSessionToken = exports.rotateSessionToken = /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(riderId, oldSessionId) {
    var rider, session, newSessionId, accessToken;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.n) {
        case 0:
          _context6.n = 1;
          return _Rider.Rider.findOne({
            riderId: riderId
          });
        case 1:
          rider = _context6.v;
          if (!(!rider || !rider.sessions)) {
            _context6.n = 2;
            break;
          }
          throw new Error("Session not found");
        case 2:
          session = rider.sessions.find(function (s) {
            return s.sessionId === oldSessionId;
          });
          if (session) {
            _context6.n = 3;
            break;
          }
          throw new Error("Session not found");
        case 3:
          // Generate new session ID
          newSessionId = (0, _uuid.v4)();
          session.sessionId = newSessionId;
          session.lastActivity = new Date();
          _context6.n = 4;
          return rider.save();
        case 4:
          // Generate new access token
          accessToken = (0, _token.signToken)({
            sub: rider.riderId,
            phoneNumber: rider.phoneNumber,
            name: rider.name,
            sessionId: newSessionId
          });
          return _context6.a(2, {
            sessionId: newSessionId,
            accessToken: accessToken
          });
      }
    }, _callee6);
  }));
  return function rotateSessionToken(_x10, _x11) {
    return _ref6.apply(this, arguments);
  };
}();