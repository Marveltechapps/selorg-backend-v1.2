"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.updateRiderLocation = exports.recalculateETA = exports.broadcastDeliveryStatus = void 0;
var _websocketService = require("../websocket/websocket.service.js");
var _Order = require("../../models/Order.js");
var _Rider = require("../../models/Rider.js");
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
/**
 * Update rider location and broadcast to relevant parties
 */
var updateRiderLocation = exports.updateRiderLocation = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(riderId, location) {
    var activeOrders, _iterator, _step, order, etaUpdate;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          _context.n = 1;
          return _Rider.Rider.findOneAndUpdate({
            riderId: riderId
          }, {
            currentLocation: {
              lat: location.lat,
              lng: location.lng,
              updatedAt: location.timestamp
            }
          });
        case 1:
          _context.n = 2;
          return _Order.Order.find({
            "riderAssignment.riderId": riderId,
            status: {
              $in: ["assigned", "picked", "out_for_delivery"]
            }
          });
        case 2:
          activeOrders = _context.v;
          // Broadcast location update for each active order
          _iterator = _createForOfIteratorHelper(activeOrders);
          try {
            for (_iterator.s(); !(_step = _iterator.n()).done;) {
              order = _step.value;
              etaUpdate = {
                orderId: String(order._id),
                estimatedArrival: new Date(Date.now() + 15 * 60 * 1000),
                // Placeholder: 15 min ETA
                distanceRemaining: 0,
                // Would be calculated using routing service
                currentLocation: {
                  lat: location.lat,
                  lng: location.lng
                }
              }; // Send to rider
              _websocketService.webSocketService.notifyOrderUpdate(riderId, {
                type: "location_update",
                orderId: String(order._id),
                location: etaUpdate
              });
              _websocketService.webSocketService.notifyOrderCustomers(String(order._id), {
                type: "rider_location",
                payload: {
                  orderId: String(order._id),
                  currentLocation: { lat: location.lat, lng: location.lng },
                  estimatedArrival: etaUpdate.estimatedArrival
                },
                timestamp: new Date().toISOString()
              });
            }
          } catch (err) {
            _iterator.e(err);
          } finally {
            _iterator.f();
          }
        case 3:
          return _context.a(2);
      }
    }, _callee);
  }));
  return function updateRiderLocation(_x, _x2) {
    return _ref.apply(this, arguments);
  };
}();

/**
 * Recalculate ETA for an order
 */
var recalculateETA = exports.recalculateETA = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(orderId, currentLocation) {
    var order, deliveryLocation, distance, estimatedMinutes, estimatedArrival, etaUpdate;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          _context2.n = 1;
          return _Order.Order.findById(orderId);
        case 1:
          order = _context2.v;
          if (!(!order || !order.riderAssignment)) {
            _context2.n = 2;
            break;
          }
          return _context2.a(2, null);
        case 2:
          deliveryLocation = order.delivery.address.coordinates;
          if (deliveryLocation) {
            _context2.n = 3;
            break;
          }
          return _context2.a(2, null);
        case 3:
          // Calculate distance (Haversine formula - simplified)
          distance = calculateDistance(currentLocation.lat, currentLocation.lng, deliveryLocation.lat, deliveryLocation.lng); // Estimate time based on distance (assuming average speed of 30 km/h)
          estimatedMinutes = distance / 30 * 60;
          estimatedArrival = new Date(Date.now() + estimatedMinutes * 60 * 1000);
          etaUpdate = {
            orderId: String(order._id),
            estimatedArrival: estimatedArrival,
            distanceRemaining: distance,
            currentLocation: currentLocation
          }; // Update order with ETA
          if (!order.metadata) {
            order.metadata = {};
          }
          order.metadata.eta = estimatedArrival.toISOString();
          order.metadata.distanceRemaining = distance;
          _context2.n = 4;
          return order.save();
        case 4:
          // Broadcast ETA update
          _websocketService.webSocketService.notifyOrderUpdate(order.riderAssignment.riderId, {
            type: "eta_update",
            orderId: String(order._id),
            eta: etaUpdate
          });
          return _context2.a(2, etaUpdate);
      }
    }, _callee2);
  }));
  return function recalculateETA(_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
}();

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  var R = 6371; // Earth's radius in km
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function toRad(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Broadcast delivery status update
 */
var broadcastDeliveryStatus = exports.broadcastDeliveryStatus = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(orderId, status, riderId) {
    var order;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          _context3.n = 1;
          return _Order.Order.findById(orderId);
        case 1:
          order = _context3.v;
          if (order) {
            _context3.n = 2;
            break;
          }
          return _context3.a(2);
        case 2:
          // Send status update to rider
          _websocketService.webSocketService.notifyOrderUpdate(riderId, {
            type: "status_update",
            orderId: String(order._id),
            status: status,
            order: {
              _id: String(order._id),
              orderNumber: order.orderNumber,
              status: order.status
            }
          });
          _websocketService.webSocketService.notifyOrderCustomers(String(order._id), {
            type: "status_update",
            payload: {
              orderId: String(order._id),
              status: status,
              order: { _id: String(order._id), orderNumber: order.orderNumber, status: order.status }
            },
            timestamp: new Date().toISOString()
          });
        case 3:
          return _context3.a(2);
      }
    }, _callee3);
  }));
  return function broadcastDeliveryStatus(_x5, _x6, _x7) {
    return _ref3.apply(this, arguments);
  };
}();