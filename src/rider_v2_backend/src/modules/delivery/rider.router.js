"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.riderRouter = void 0;
var _express = require("express");
var _zod = require("zod");
var riderService = _interopRequireWildcard(require("./rider.service.js"));
var _authenticate = require("../../middleware/authenticate.js");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t0 in e) "default" !== _t0 && {}.hasOwnProperty.call(e, _t0) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t0)) && (i.get || i.set) ? o(f, _t0, i) : f[_t0] = e[_t0]); return f; })(e, t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var createRiderSchema = _zod.z.object({
  name: _zod.z.string().min(2),
  phoneNumber: _zod.z.string().regex(/^\+?[1-9]\d{9,14}$/),
  email: _zod.z.string().email().optional(),
  vehicleType: _zod.z["enum"](["bike", "scooter", "bicycle"])
});
var updateLocationSchema = _zod.z.object({
  lat: _zod.z.number().min(-90).max(90),
  lng: _zod.z.number().min(-180).max(180)
});
var startShiftSchema = _zod.z.object({
  warehouseCode: _zod.z.string().min(3)
});
var setAvailabilitySchema = _zod.z.object({
  availability: _zod.z["enum"](["available", "busy", "offline"])
});
var preferredLocationSchema = _zod.z.object({
  latitude: _zod.z.number().min(-90).max(90),
  longitude: _zod.z.number().min(-180).max(180),
  addressLabel: _zod.z.string().optional(),
  cityId: _zod.z.string().optional(),
  cityName: _zod.z.string().optional(),
  hubId: _zod.z.string().optional(),
  hubName: _zod.z.string().optional()
});
var riderRouter = exports.riderRouter = (0, _express.Router)();

// Create new rider (onboarding)
riderRouter.post("/riders", /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(req, res) {
    var parseResult, _yield$riderService$c, rider, isNew, _t;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          parseResult = createRiderSchema.safeParse(req.body);
          if (parseResult.success) {
            _context.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context.a(2);
        case 1:
          _context.p = 1;
          _context.n = 2;
          return riderService.createRider(parseResult.data);
        case 2:
          _yield$riderService$c = _context.v;
          rider = _yield$riderService$c.rider;
          isNew = _yield$riderService$c.isNew;
          res.status(isNew ? 201 : 200).json({
            rider: rider,
            isNew: isNew
          });
          _context.n = 4;
          break;
        case 3:
          _context.p = 3;
          _t = _context.v;
          if (_t instanceof Error) {
            res.status(400).json({
              error: _t.message
            });
          } else {
            res.status(400).json({
              error: "Unable to create rider"
            });
          }
        case 4:
          return _context.a(2);
      }
    }, _callee, null, [[1, 3]]);
  }));
  return function (_x, _x2) {
    return _ref.apply(this, arguments);
  };
}());

// Get rider by ID
riderRouter.get("/riders/:riderId", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(req, res) {
    var rider, _t2;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.p = _context2.n) {
        case 0:
          _context2.p = 0;
          if (req.user) {
            _context2.n = 1;
            break;
          }
          res.status(401).json({
            error: "Authentication required"
          });
          return _context2.a(2);
        case 1:
          _context2.n = 2;
          return riderService.getRiderById(req.params.riderId);
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
          if (!(req.params.riderId !== req.user.id)) {
            _context2.n = 4;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context2.a(2);
        case 4:
          res.json({
            rider: rider
          });
          _context2.n = 6;
          break;
        case 5:
          _context2.p = 5;
          _t2 = _context2.v;
          console.error("Error fetching rider:", _t2);
          res.status(500).json({
            error: "Failed to fetch rider"
          });
        case 6:
          return _context2.a(2);
      }
    }, _callee2, null, [[0, 5]]);
  }));
  return function (_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
}());

// Update rider location
riderRouter.post("/riders/:riderId/location", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(req, res) {
    var parseResult, rider, _t3;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.p = _context3.n) {
        case 0:
          parseResult = updateLocationSchema.safeParse(req.body);
          if (parseResult.success) {
            _context3.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context3.a(2);
        case 1:
          if (!(!req.user || req.params.riderId !== req.user.id)) {
            _context3.n = 2;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context3.a(2);
        case 2:
          _context3.p = 2;
          _context3.n = 3;
          return riderService.updateRiderLocation({
            riderId: req.params.riderId,
            lat: parseResult.data.lat,
            lng: parseResult.data.lng
          });
        case 3:
          rider = _context3.v;
          if (rider) {
            _context3.n = 4;
            break;
          }
          res.status(404).json({
            error: "Rider not found"
          });
          return _context3.a(2);
        case 4:
          res.json({
            rider: rider
          });
          _context3.n = 6;
          break;
        case 5:
          _context3.p = 5;
          _t3 = _context3.v;
          res.status(500).json({
            error: "Failed to update location"
          });
          return _context3.a(2);
        case 6:
          return _context3.a(2);
      }
    }, _callee3, null, [[2, 5]]);
  }));
  return function (_x5, _x6) {
    return _ref3.apply(this, arguments);
  };
}());

// Save/update rider preferred location (city, address, hub from app)
riderRouter.put("/riders/:riderId/preferred-location", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref3b = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3b(req, res) {
    var parseResult, rider, _t3b;
    return _regenerator().w(function (_context3b) {
      while (1) switch (_context3b.p = _context3b.n) {
        case 0:
          parseResult = preferredLocationSchema.safeParse(req.body);
          if (parseResult.success) {
            _context3b.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context3b.a(2);
        case 1:
          if (!(!req.user || req.params.riderId !== req.user.id)) {
            _context3b.n = 2;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context3b.a(2);
        case 2:
          _context3b.p = 2;
          _context3b.n = 3;
          return riderService.updateRiderPreferredLocation(req.params.riderId, parseResult.data);
        case 3:
          rider = _context3b.v;
          if (rider) {
            _context3b.n = 4;
            break;
          }
          res.status(404).json({
            error: "Rider not found"
          });
          return _context3b.a(2);
        case 4:
          res.json({
            rider: rider
          });
          _context3b.n = 6;
          break;
        case 5:
          _context3b.p = 5;
          _t3b = _context3b.v;
          res.status(500).json({
            error: "Failed to update preferred location"
          });
          return _context3b.a(2);
        case 6:
          return _context3b.a(2);
      }
    }, _callee3b, null, [[2, 5]]);
  }));
  return function (_x5b, _x6b) {
    return _ref3b.apply(this, arguments);
  };
}());

// Start shift
riderRouter.post("/riders/:riderId/shift/start", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(req, res) {
    var parseResult, rider, _t4;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.p = _context4.n) {
        case 0:
          parseResult = startShiftSchema.safeParse(req.body);
          if (parseResult.success) {
            _context4.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context4.a(2);
        case 1:
          if (!(!req.user || req.params.riderId !== req.user.id)) {
            _context4.n = 2;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context4.a(2);
        case 2:
          _context4.p = 2;
          _context4.n = 3;
          return riderService.startShift(req.params.riderId, parseResult.data.warehouseCode);
        case 3:
          rider = _context4.v;
          if (rider) {
            _context4.n = 4;
            break;
          }
          res.status(404).json({
            error: "Rider not found or not approved"
          });
          return _context4.a(2);
        case 4:
          res.json({
            rider: rider
          });
          _context4.n = 6;
          break;
        case 5:
          _context4.p = 5;
          _t4 = _context4.v;
          res.status(500).json({
            error: "Failed to start shift"
          });
          return _context4.a(2);
        case 6:
          return _context4.a(2);
      }
    }, _callee4, null, [[2, 5]]);
  }));
  return function (_x7, _x8) {
    return _ref4.apply(this, arguments);
  };
}());

// End shift
riderRouter.post("/riders/:riderId/shift/end", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(req, res) {
    var rider, _t5;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.p = _context5.n) {
        case 0:
          if (!(!req.user || req.params.riderId !== req.user.id)) {
            _context5.n = 1;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context5.a(2);
        case 1:
          _context5.p = 1;
          _context5.n = 2;
          return riderService.endShift(req.params.riderId);
        case 2:
          rider = _context5.v;
          if (rider) {
            _context5.n = 3;
            break;
          }
          res.status(404).json({
            error: "Rider not found"
          });
          return _context5.a(2);
        case 3:
          res.json({
            rider: rider
          });
          _context5.n = 5;
          break;
        case 4:
          _context5.p = 4;
          _t5 = _context5.v;
          res.status(500).json({
            error: "Failed to end shift"
          });
        case 5:
          return _context5.a(2);
      }
    }, _callee5, null, [[1, 4]]);
  }));
  return function (_x9, _x0) {
    return _ref5.apply(this, arguments);
  };
}());

// Set availability
riderRouter.post("/riders/:riderId/availability", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(req, res) {
    var parseResult, rider, _t6;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.p = _context6.n) {
        case 0:
          parseResult = setAvailabilitySchema.safeParse(req.body);
          if (parseResult.success) {
            _context6.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context6.a(2);
        case 1:
          if (!(!req.user || req.params.riderId !== req.user.id)) {
            _context6.n = 2;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context6.a(2);
        case 2:
          _context6.p = 2;
          _context6.n = 3;
          return riderService.setAvailability(req.params.riderId, parseResult.data.availability);
        case 3:
          rider = _context6.v;
          if (rider) {
            _context6.n = 4;
            break;
          }
          res.status(404).json({
            error: "Rider not found"
          });
          return _context6.a(2);
        case 4:
          res.json({
            rider: rider
          });
          _context6.n = 6;
          break;
        case 5:
          _context6.p = 5;
          _t6 = _context6.v;
          res.status(500).json({
            error: "Failed to update availability"
          });
        case 6:
          return _context6.a(2);
      }
    }, _callee6, null, [[2, 5]]);
  }));
  return function (_x1, _x10) {
    return _ref6.apply(this, arguments);
  };
}());

// Get rider stats
riderRouter.get("/riders/:riderId/stats", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7(req, res) {
    var stats, _t7;
    return _regenerator().w(function (_context7) {
      while (1) switch (_context7.p = _context7.n) {
        case 0:
          if (!(!req.user || req.params.riderId !== req.user.id)) {
            _context7.n = 1;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context7.a(2);
        case 1:
          _context7.p = 1;
          _context7.n = 2;
          return riderService.getRiderStats(req.params.riderId);
        case 2:
          stats = _context7.v;
          res.json({
            stats: stats
          });
          _context7.n = 5;
          break;
        case 3:
          _context7.p = 3;
          _t7 = _context7.v;
          if (!(_t7 instanceof Error)) {
            _context7.n = 4;
            break;
          }
          res.status(404).json({
            error: _t7.message
          });
          return _context7.a(2);
        case 4:
          res.status(500).json({
            error: "Failed to fetch stats"
          });
          return _context7.a(2);
        case 5:
          return _context7.a(2);
      }
    }, _callee7, null, [[1, 3]]);
  }));
  return function (_x11, _x12) {
    return _ref7.apply(this, arguments);
  };
}());
var updateProfileSchema = _zod.z.object({
  name: _zod.z.string().min(2).optional(),
  email: _zod.z.string().email().optional(),
  vehicle: _zod.z.object({
    registrationNumber: _zod.z.string().optional(),
    model: _zod.z.string().optional()
  }).optional(),
  bankDetails: _zod.z.object({
    accountNumber: _zod.z.string().optional(),
    ifscCode: _zod.z.string().optional(),
    accountHolderName: _zod.z.string().optional()
  }).optional()
});
riderRouter.patch("/riders/:riderId", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref8 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8(req, res) {
    var parseResult, rider, _t8;
    return _regenerator().w(function (_context8) {
      while (1) switch (_context8.p = _context8.n) {
        case 0:
          parseResult = updateProfileSchema.safeParse(req.body);
          if (parseResult.success) {
            _context8.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context8.a(2);
        case 1:
          if (!(!req.user || req.params.riderId !== req.user.id)) {
            _context8.n = 2;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context8.a(2);
        case 2:
          _context8.p = 2;
          _context8.n = 3;
          return riderService.updateRiderProfile(req.params.riderId, parseResult.data);
        case 3:
          rider = _context8.v;
          if (rider) {
            _context8.n = 4;
            break;
          }
          res.status(404).json({
            error: "Rider not found"
          });
          return _context8.a(2);
        case 4:
          res.json({
            rider: rider
          });
          _context8.n = 6;
          break;
        case 5:
          _context8.p = 5;
          _t8 = _context8.v;
          console.error("Failed to update rider profile:", _t8);
          res.status(500).json({
            error: "Failed to update rider profile"
          });
        case 6:
          return _context8.a(2);
      }
    }, _callee8, null, [[2, 5]]);
  }));
  return function (_x13, _x14) {
    return _ref8.apply(this, arguments);
  };
}());
var uploadDocumentSchema = _zod.z.object({
  type: _zod.z["enum"](["drivingLicense", "vehicleRC", "aadhar"]),
  url: _zod.z.string().url()
});
riderRouter.post("/riders/:riderId/documents", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref9 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9(req, res) {
    var parseResult, rider, _t9;
    return _regenerator().w(function (_context9) {
      while (1) switch (_context9.p = _context9.n) {
        case 0:
          parseResult = uploadDocumentSchema.safeParse(req.body);
          if (parseResult.success) {
            _context9.n = 1;
            break;
          }
          res.status(400).json({
            error: parseResult.error.flatten()
          });
          return _context9.a(2);
        case 1:
          if (!(!req.user || req.params.riderId !== req.user.id)) {
            _context9.n = 2;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context9.a(2);
        case 2:
          _context9.p = 2;
          _context9.n = 3;
          return riderService.uploadDocument(req.params.riderId, parseResult.data.type, parseResult.data.url);
        case 3:
          rider = _context9.v;
          if (rider) {
            _context9.n = 4;
            break;
          }
          res.status(404).json({
            error: "Rider not found"
          });
          return _context9.a(2);
        case 4:
          res.json({
            rider: rider
          });
          _context9.n = 6;
          break;
        case 5:
          _context9.p = 5;
          _t9 = _context9.v;
          console.error("Failed to upload document:", _t9);
          res.status(500).json({
            error: "Failed to upload document"
          });
        case 6:
          return _context9.a(2);
      }
    }, _callee9, null, [[2, 5]]);
  }));
  return function (_x15, _x16) {
    return _ref9.apply(this, arguments);
  };
}());