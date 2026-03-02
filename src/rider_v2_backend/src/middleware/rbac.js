"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.requireRole = exports.requirePermission = void 0;
var _Rider = require("../models/Rider.js");
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
/**
 * Middleware to check if user has required role
 */
var requireRole = exports.requireRole = function requireRole() {
  for (var _len = arguments.length, allowedRoles = new Array(_len), _key = 0; _key < _len; _key++) {
    allowedRoles[_key] = arguments[_key];
  }
  return /*#__PURE__*/function () {
    var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(req, res, next) {
      var rider, userRole, _t;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.p = _context.n) {
          case 0:
            if (req.user) {
              _context.n = 1;
              break;
            }
            res.status(401).json({
              error: "Authentication required"
            });
            return _context.a(2);
          case 1:
            _context.p = 1;
            _context.n = 2;
            return _Rider.Rider.findOne({
              riderId: req.user.id
            });
          case 2:
            rider = _context.v;
            if (rider) {
              _context.n = 3;
              break;
            }
            res.status(404).json({
              error: "Rider not found"
            });
            return _context.a(2);
          case 3:
            userRole = rider.role || "rider";
            if (allowedRoles.includes(userRole)) {
              _context.n = 4;
              break;
            }
            res.status(403).json({
              error: "Access denied",
              message: "This endpoint requires one of the following roles: ".concat(allowedRoles.join(", "))
            });
            return _context.a(2);
          case 4:
            // Attach role to request for use in handlers
            if (req.user) {
              req.user.role = userRole;
            }
            next();
            _context.n = 6;
            break;
          case 5:
            _context.p = 5;
            _t = _context.v;
            console.error("[RBAC] Error checking role:", _t);
            res.status(500).json({
              error: "Failed to verify permissions"
            });
            return _context.a(2);
          case 6:
            return _context.a(2);
        }
      }, _callee, null, [[1, 5]]);
    }));
    return function (_x, _x2, _x3) {
      return _ref.apply(this, arguments);
    };
  }();
};

/**
 * Middleware to check if user has any of the required permissions
 */
var requirePermission = exports.requirePermission = function requirePermission() {
  for (var _len2 = arguments.length, permissions = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
    permissions[_key2] = arguments[_key2];
  }
  return /*#__PURE__*/function () {
    var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(req, res, next) {
      var rider, userRole, rolePermissions, userPermissions, hasPermission, _t2;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.p = _context2.n) {
          case 0:
            if (req.user) {
              _context2.n = 1;
              break;
            }
            res.status(401).json({
              error: "Authentication required"
            });
            return _context2.a(2);
          case 1:
            _context2.p = 1;
            _context2.n = 2;
            return _Rider.Rider.findOne({
              riderId: req.user.id
            });
          case 2:
            rider = _context2.v;
            if (rider) {
              _context2.n = 3;
              break;
            }
            res.status(404).json({
              error: "Rider not found"
            });
            return _context2.a(2);
          case 3:
            userRole = rider.role || "rider"; // Define role-based permissions
            rolePermissions = {
              rider: ["view_own_orders", "update_own_orders", "view_own_earnings"],
              dispatcher: ["view_orders", "assign_orders", "view_riders", "view_analytics"],
              support: ["view_orders", "view_riders", "view_incidents", "resolve_incidents"],
              admin: ["view_orders", "assign_orders", "view_riders", "manage_riders", "view_analytics", "manage_settings", "view_incidents", "resolve_incidents"]
            };
            userPermissions = rolePermissions[userRole] || [];
            hasPermission = permissions.some(function (permission) {
              return userPermissions.includes(permission);
            });
            if (hasPermission) {
              _context2.n = 4;
              break;
            }
            res.status(403).json({
              error: "Access denied",
              message: "This endpoint requires one of the following permissions: ".concat(permissions.join(", "))
            });
            return _context2.a(2);
          case 4:
            next();
            _context2.n = 6;
            break;
          case 5:
            _context2.p = 5;
            _t2 = _context2.v;
            console.error("[RBAC] Error checking permission:", _t2);
            res.status(500).json({
              error: "Failed to verify permissions"
            });
            return _context2.a(2);
          case 6:
            return _context2.a(2);
        }
      }, _callee2, null, [[1, 5]]);
    }));
    return function (_x4, _x5, _x6) {
      return _ref2.apply(this, arguments);
    };
  }();
};