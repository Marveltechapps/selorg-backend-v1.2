"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.uploadDocument = exports.updateRiderPreferredLocation = exports.updateRiderProfile = exports.updateRiderLocation = exports.startShift = exports.setAvailability = exports.getRiderStats = exports.getRiderByPhone = exports.getRiderById = exports.endShift = exports.createRider = void 0;
var _nodeCrypto = require("node:crypto");
var _Rider = require("../../models/Rider.js");
var _Order = require("../../models/Order.js");
var _riderCacheHelper = require("../../utils/riderCacheHelper.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var createRider = exports.createRider = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(input) {
    var existing, riderId, rider, _t;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          _context.n = 1;
          return _Rider.Rider.findOne({
            phoneNumber: input.phoneNumber
          });
        case 1:
          existing = _context.v;
          if (!existing) {
            _context.n = 2;
            break;
          }
          return _context.a(2, {
            rider: existing,
            isNew: false
          });
        case 2:
          riderId = "rider-".concat((0, _nodeCrypto.randomUUID)().slice(0, 8));
          rider = new _Rider.Rider({
            riderId: riderId,
            name: input.name,
            phoneNumber: input.phoneNumber,
            email: input.email,
            vehicle: {
              type: input.vehicleType
            },
            status: "pending",
            availability: "offline"
          });
          _context.p = 3;
          _context.n = 4;
          return rider.save();
        case 4:
          _context.n = 7;
          break;
        case 5:
          _context.p = 5;
          _t = _context.v;
          if (!((_t === null || _t === void 0 ? void 0 : _t.code) === 11000)) {
            _context.n = 6;
            break;
          }
          throw new Error("Phone number already registered. Please log in instead.");
        case 6:
          throw _t;
        case 7:
          return _context.a(2, {
            rider: rider,
            isNew: true
          });
      }
    }, _callee, null, [[3, 5]]);
  }));
  return function createRider(_x) {
    return _ref.apply(this, arguments);
  };
}();
var getRiderById = exports.getRiderById = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(riderId) {
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          return _context2.a(2, _riderCacheHelper.getCachedOrCompute("rider:profile:".concat(riderId), 30, /*#__PURE__*/function () {
            var _ref2inner = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2inner() {
              var doc;
              return _regenerator().w(function (_context2inner) {
                switch (_context2inner.n) {
                  case 0:
                    return _context2inner.a(2, _Rider.Rider.findOne({ riderId: riderId }).lean());
                  case 1:
                    doc = _context2inner.v;
                    return _context2inner.a(2, doc || null);
                }
              }, _callee2inner);
            }));
            return function () { return _ref2inner.apply(this, arguments); };
          }()));
      }
    }, _callee2);
  }));
  return function getRiderById(_x2) {
    return _ref2.apply(this, arguments);
  };
}();
var getRiderByPhone = exports.getRiderByPhone = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(phoneNumber) {
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          return _context3.a(2, _Rider.Rider.findOne({
            phoneNumber: phoneNumber
          }));
      }
    }, _callee3);
  }));
  return function getRiderByPhone(_x3) {
    return _ref3.apply(this, arguments);
  };
}();
var updateRiderLocation = exports.updateRiderLocation = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(input) {
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.n) {
        case 0:
          return _context4.a(2, _Rider.Rider.findOneAndUpdate({
            riderId: input.riderId
          }, {
            currentLocation: {
              lat: input.lat,
              lng: input.lng,
              updatedAt: new Date()
            }
          }, {
            "new": true
          }));
      }
    }, _callee4);
  }));
  return function updateRiderLocation(_x4) {
    return _ref4.apply(this, arguments);
  };
}();
var startShift = exports.startShift = /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(riderId, warehouseCode) {
    var shiftId;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          shiftId = "shift-".concat((0, _nodeCrypto.randomUUID)().slice(0, 8));
          return _context5.a(2, _Rider.Rider.findOneAndUpdate({
            riderId: riderId,
            status: "approved"
          }, {
            currentShift: {
              shiftId: shiftId,
              startedAt: new Date(),
              warehouseCode: warehouseCode
            },
            availability: "available"
          }, {
            "new": true
          }));
      }
    }, _callee5);
  }));
  return function startShift(_x5, _x6) {
    return _ref5.apply(this, arguments);
  };
}();
var endShift = exports.endShift = /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(riderId) {
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.n) {
        case 0:
          return _context6.a(2, _Rider.Rider.findOneAndUpdate({
            riderId: riderId
          }, {
            $unset: {
              currentShift: ""
            },
            availability: "offline"
          }, {
            "new": true
          }));
      }
    }, _callee6);
  }));
  return function endShift(_x7) {
    return _ref6.apply(this, arguments);
  };
}();
var setAvailability = exports.setAvailability = /*#__PURE__*/function () {
  var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7(riderId, availability) {
    var rider;
    return _regenerator().w(function (_context7) {
      while (1) switch (_context7.n) {
        case 0:
          _context7.n = 1;
          return _Rider.Rider.findOneAndUpdate({ riderId: riderId }, { availability: availability }, { "new": true });
        case 1:
          rider = _context7.v;
          _riderCacheHelper.invalidateRider(riderId).catch(function () {});
          return _context7.a(2, rider);
      }
    }, _callee7);
  }));
  return function setAvailability(_x8, _x9) {
    return _ref7.apply(this, arguments);
  };
}();
var getRiderStats = exports.getRiderStats = /*#__PURE__*/function () {
  var _ref8 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8(riderId) {
    var computeStats;
    return _regenerator().w(function (_context8) {
      while (1) switch (_context8.n) {
        case 0:
          computeStats = /*#__PURE__*/function () {
            var _ref8in = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8in() {
              var rider, delivered, onTimeCount, totalDelivered, acceptanceRate, onTimePct;
              return _regenerator().w(function (_context8in) {
                while (1) switch (_context8in.n) {
                  case 0:
                    _context8in.n = 1;
                    return _Rider.Rider.findOne({ riderId: riderId });
                  case 1:
                    rider = _context8in.v;
                    if (rider) { _context8in.n = 2; break; }
                    throw new Error("Rider not found");
                  case 2:
                    _context8in.n = 3;
                    return _Order.Order.find({
                      "riderAssignment.riderId": riderId,
                      status: "delivered",
                      "riderAssignment.deliveredAt": { $exists: true, $ne: null }
                    }).select("riderAssignment.deliveredAt delivery.scheduledTime");
                  case 3:
                    delivered = _context8in.v;
                    onTimeCount = 0;
                    totalDelivered = delivered.length;
                    if (totalDelivered > 0) {
                      delivered.forEach(function (o) {
                        var deliveredAt = o.riderAssignment && o.riderAssignment.deliveredAt ? new Date(o.riderAssignment.deliveredAt) : null;
                        var scheduled = o.delivery && o.delivery.scheduledTime ? new Date(o.delivery.scheduledTime) : null;
                        if (deliveredAt && scheduled) {
                          var slack = 30 * 60 * 1000;
                          if (deliveredAt.getTime() <= scheduled.getTime() + slack) onTimeCount++;
                        }
                      });
                    }
                    acceptanceRate = rider.stats && rider.stats.completedDeliveries != null && rider.stats.totalDeliveries > 0
                      ? Math.min(100, Math.round((rider.stats.completedDeliveries / rider.stats.totalDeliveries) * 1000) / 10)
                      : 100;
                    onTimePct = totalDelivered > 0 ? Math.round((onTimeCount / totalDelivered) * 1000) / 10 : 100;
                    return _context8in.a(2, {
                      riderId: rider.riderId,
                      name: rider.name,
                      stats: _objectSpread(_objectSpread({}, rider.stats), {}, {
                        averageRating: rider.stats.averageRating || 0,
                        totalRatings: rider.stats.totalRatings || 0,
                        acceptanceRate: acceptanceRate + "%",
                        onTimeDelivery: onTimePct + "%"
                      }),
                      earnings: rider.earnings,
                      lifetimeEarnings: (rider.earnings && rider.earnings.totalEarned) || 0,
                      floatingCash: (rider.earnings && rider.earnings.pendingAmount) || 0,
                      status: rider.status,
                      availability: rider.availability
                    });
                }
              }, _callee8in);
            }));
            return function computeStats() { return _ref8in.apply(this, arguments); };
          }();
          return _context8.a(2, _riderCacheHelper.getCachedOrCompute("rider:stats:".concat(riderId), 30, computeStats));
      }
    }, _callee8);
  }));
  return function getRiderStats(_x0) {
    return _ref8.apply(this, arguments);
  };
}();
var updateRiderProfile = exports.updateRiderProfile = /*#__PURE__*/function () {
  var _ref9 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9(riderId, updates) {
    var update, rider;
    return _regenerator().w(function (_context9) {
      while (1) switch (_context9.n) {
        case 0:
          update = {};
          if (updates.name) update.name = updates.name;
          if (updates.email !== undefined) update.email = updates.email;
          if (updates.vehicle) {
            update["vehicle.registrationNumber"] = updates.vehicle.registrationNumber;
            update["vehicle.model"] = updates.vehicle.model;
          }
          if (updates.bankDetails) {
            update["bankDetails.accountNumber"] = updates.bankDetails.accountNumber;
            update["bankDetails.ifscCode"] = updates.bankDetails.ifscCode;
            update["bankDetails.accountHolderName"] = updates.bankDetails.accountHolderName;
          }
          _context9.n = 1;
          return _Rider.Rider.findOneAndUpdate({ riderId: riderId }, { $set: update }, { "new": true });
        case 1:
          rider = _context9.v;
          _riderCacheHelper.invalidateRider(riderId).catch(function () {});
          return _context9.a(2, rider);
      }
    }, _callee9);
  }));
  return function updateRiderProfile(_x1, _x10) {
    return _ref9.apply(this, arguments);
  };
}();
var updateRiderPreferredLocation = exports.updateRiderPreferredLocation = /*#__PURE__*/function () {
  var _ref10 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee10(riderId, data) {
    var preferred, rider;
    return _regenerator().w(function (_context10) {
      while (1) switch (_context10.n) {
        case 0:
          preferred = {
            preferredLocation: {
              latitude: data.latitude,
              longitude: data.longitude,
              addressLabel: data.addressLabel || null,
              cityId: data.cityId || null,
              cityName: data.cityName || null,
              hubId: data.hubId || null,
              hubName: data.hubName || null,
              updatedAt: new Date()
            }
          };
          _context10.n = 1;
          return _Rider.Rider.findOneAndUpdate({ riderId: riderId }, { $set: preferred }, { "new": true });
        case 1:
          rider = _context10.v;
          _riderCacheHelper.invalidateRider(riderId).catch(function () {});
          return _context10.a(2, rider);
      }
    }, _callee10);
  }));
  return function updateRiderPreferredLocation(_x14, _x15) {
    return _ref10.apply(this, arguments);
  };
}();
var uploadDocument = exports.uploadDocument = /*#__PURE__*/function () {
  var _ref0 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0(riderId, documentType, documentUrl) {
    var updateField, rider;
    return _regenerator().w(function (_context0) {
      while (1) switch (_context0.n) {
        case 0:
          updateField = "documents.".concat(documentType, ".documentUrl");
          _context0.n = 1;
          return _Rider.Rider.findOneAndUpdate(
            { riderId: riderId },
            { $set: _defineProperty({}, updateField, documentUrl) },
            { "new": true }
          );
        case 1:
          rider = _context0.v;
          _riderCacheHelper.invalidateRider(riderId).catch(function () {});
          return _context0.a(2, rider);
      }
    }, _callee0);
  }));
  return function uploadDocument(_x11, _x12, _x13) {
    return _ref0.apply(this, arguments);
  };
}();