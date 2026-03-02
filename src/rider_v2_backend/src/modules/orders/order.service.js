"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.rejectOrder = exports.markOrderPicked = exports.markOrderOutForDelivery = exports.markOrderDelivered = exports.listOrders = exports.getOrderById = exports.acceptOrder = void 0;
var _Order = require("../../models/Order.js");
var _Rider = require("../../models/Rider.js");
var _riderCacheHelper = require("../../utils/riderCacheHelper.js");

var _customerOrderModel = require("../../../../customer-backend/models/Order");
var _customerOrderService = require("../../../../customer-backend/services/orderService");

var RIDER_TO_CUSTOMER_STATUS = {
  picked: 'on-the-way',
  out_for_delivery: 'arrived',
};

function propagateRiderStatusToCustomer(riderOrder, riderStatus) {
  var customerStatus = RIDER_TO_CUSTOMER_STATUS[riderStatus];
  if (!customerStatus) return;
  var orderNum = riderOrder && riderOrder.orderNumber;
  if (!orderNum) return;
  _customerOrderModel.Order.findOne({ orderNumber: orderNum }).lean().then(function (co) {
    if (co) {
      _customerOrderService.updateCustomerOrderStatus(co._id, customerStatus, {
        actor: 'rider',
        riderId: riderOrder.riderAssignment && riderOrder.riderAssignment.riderId,
      });
    }
  }).catch(function (err) {
    console.warn('Rider->Customer status propagation failed (non-blocking):', err.message);
  });
}
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var getOrderById = exports.getOrderById = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(orderId) {
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          return _context.a(2, _Order.Order.findById(orderId));
      }
    }, _callee);
  }));
  return function getOrderById(_x) {
    return _ref.apply(this, arguments);
  };
}();
var listOrders = exports.listOrders = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(filters) {
    var riderId, queryHash, key, compute;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          riderId = (filters === null || filters === void 0 ? void 0 : filters.riderId) || "";
          queryHash = [filters === null || filters === void 0 ? void 0 : filters.status, filters === null || filters === void 0 ? void 0 : filters.warehouseCode, (filters === null || filters === void 0 ? void 0 : filters.limit) || 50].join(":");
          key = "rider:orders:".concat(riderId, ":").concat(queryHash);
          compute = /*#__PURE__*/function () {
            var _ref2in = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2in() {
              var query, limit;
              return _regenerator().w(function (_context2in) {
                while (1) switch (_context2in.n) {
                  case 0:
                    query = {};
                    if (filters !== null && filters !== void 0 && filters.status) query.status = filters.status;
                    if (filters !== null && filters !== void 0 && filters.warehouseCode) query.warehouseCode = filters.warehouseCode;
                    if (filters !== null && filters !== void 0 && filters.riderId) query["riderAssignment.riderId"] = filters.riderId;
                    if (filters !== null && filters !== void 0 && filters.customerPhoneNumber) query.customerPhoneNumber = filters.customerPhoneNumber;
                    limit = (filters === null || filters === void 0 ? void 0 : filters.limit) || 50;
                    return _context2in.a(2, _Order.Order.find(query).sort({ createdAt: -1 }).limit(limit).lean());
                }
              }, _callee2in);
            }));
            return function compute() { return _ref2in.apply(this, arguments); };
          }();
          return _context2.a(2, _riderCacheHelper.getCachedOrCompute(key, 15, compute));
      }
    }, _callee2);
  }));
  return function listOrders(_x2) {
    return _ref2.apply(this, arguments);
  };
}();
var markOrderPicked = exports.markOrderPicked = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(orderId, riderId) {
    var order;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          _context3.n = 1;
          return _Order.Order.findById(orderId);
        case 1:
          order = _context3.v;
          if (!(!order || !order.riderAssignment)) {
            _context3.n = 2;
            break;
          }
          throw new Error("Order not found or not assigned");
        case 2:
          if (!(order.riderAssignment.riderId !== riderId)) {
            _context3.n = 3;
            break;
          }
          throw new Error("Order not assigned to this rider");
        case 3:
          if (!(order.status !== "assigned")) {
            _context3.n = 4;
            break;
          }
          throw new Error("Order cannot be picked. Current status: ".concat(order.status));
        case 4:
          order.status = "picked";
          if (order.riderAssignment) {
            order.riderAssignment.pickedAt = new Date();
          }
          order.timeline.push({
            status: "picked",
            timestamp: new Date(),
            note: "Order picked from warehouse"
          });
          _context3.n = 5;
          return order.save();
        case 5:
          _riderCacheHelper.invalidateOrdersForRider().catch(function () {});
          propagateRiderStatusToCustomer(order, "picked");
          return _context3.a(2, order);
      }
    }, _callee3);
  }));
  return function markOrderPicked(_x3, _x4) {
    return _ref3.apply(this, arguments);
  };
}();
var markOrderOutForDelivery = exports.markOrderOutForDelivery = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(orderId, riderId) {
    var order;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.n) {
        case 0:
          _context4.n = 1;
          return _Order.Order.findById(orderId);
        case 1:
          order = _context4.v;
          if (!(!order || !order.riderAssignment)) {
            _context4.n = 2;
            break;
          }
          throw new Error("Order not found or not assigned");
        case 2:
          if (!(order.riderAssignment.riderId !== riderId)) {
            _context4.n = 3;
            break;
          }
          throw new Error("Order not assigned to this rider");
        case 3:
          if (!(order.status !== "picked")) {
            _context4.n = 4;
            break;
          }
          throw new Error("Order must be picked first");
        case 4:
          order.status = "out_for_delivery";
          order.timeline.push({
            status: "out_for_delivery",
            timestamp: new Date(),
            note: "Order out for delivery"
          });
          _context4.n = 5;
          return order.save();
        case 5:
          _riderCacheHelper.invalidateOrdersForRider().catch(function () {});
          propagateRiderStatusToCustomer(order, "out_for_delivery");
          return _context4.a(2, order);
      }
    }, _callee4);
  }));
  return function markOrderOutForDelivery(_x5, _x6) {
    return _ref4.apply(this, arguments);
  };
}();
var markOrderDelivered = exports.markOrderDelivered = /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(orderId, riderId, proofOfDelivery) {
    var order, rider, baseEarning;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          _context5.n = 1;
          return _Order.Order.findById(orderId);
        case 1:
          order = _context5.v;
          if (!(!order || !order.riderAssignment)) {
            _context5.n = 2;
            break;
          }
          throw new Error("Order not found or not assigned");
        case 2:
          if (!(order.riderAssignment.riderId !== riderId)) {
            _context5.n = 3;
            break;
          }
          throw new Error("Order not assigned to this rider");
        case 3:
          if (!(order.status !== "out_for_delivery")) {
            _context5.n = 4;
            break;
          }
          throw new Error("Order must be out for delivery");
        case 4:
          order.status = "delivered";
          if (order.riderAssignment) {
            order.riderAssignment.deliveredAt = new Date();
          }
          order.timeline.push({
            status: "delivered",
            timestamp: new Date(),
            note: proofOfDelivery ? "Delivered with ".concat(proofOfDelivery.type, " verification") : "Order delivered successfully"
          });

          // Update payment status for COD
          if (order.payment.method === "cod" && order.payment.status === "pending") {
            order.payment.status = "completed";
          }

          // Update rider stats and availability
          if (!order.riderAssignment) {
            _context5.n = 6;
            break;
          }
          _context5.n = 5;
          return _Rider.Rider.findOne({
            riderId: order.riderAssignment.riderId
          });
        case 5:
          rider = _context5.v;
          if (!rider) {
            _context5.n = 6;
            break;
          }
          rider.stats.totalDeliveries += 1;
          rider.stats.completedDeliveries += 1;
          // Calculate earnings (example: ₹30 base + delivery fee)
          baseEarning = order.pricing.deliveryFee || 30;
          rider.earnings.totalEarned += baseEarning;
          rider.earnings.pendingAmount += baseEarning;
          rider.availability = "available";
          _context5.n = 6;
          return rider.save();
        case 6:
          _context5.n = 7;
          return order.save();
        case 7:
          _riderCacheHelper.invalidateOrdersForRider().catch(function () {});
          return _context5.a(2, order);
      }
    }, _callee5);
  }));
  return function markOrderDelivered(_x7, _x8, _x9) {
    return _ref5.apply(this, arguments);
  };
}();
var acceptOrder = exports.acceptOrder = /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(orderId, riderId) {
    var _order$riderAssignmen, _order$riderAssignmen2;
    var order;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.n) {
        case 0:
          _context6.n = 1;
          return _Order.Order.findById(orderId);
        case 1:
          order = _context6.v;
          if (order) {
            _context6.n = 2;
            break;
          }
          throw new Error("Order not found");
        case 2:
          if (!(order.status !== "assigned")) {
            _context6.n = 3;
            break;
          }
          throw new Error("Order cannot be accepted. Current status: ".concat(order.status));
        case 3:
          if (!(((_order$riderAssignmen = order.riderAssignment) === null || _order$riderAssignmen === void 0 ? void 0 : _order$riderAssignmen.riderId) !== riderId)) {
            _context6.n = 4;
            break;
          }
          throw new Error("Order not assigned to this rider");
        case 4:
          order.riderAssignment = _objectSpread(_objectSpread({}, order.riderAssignment), {}, {
            riderId: riderId,
            assignedAt: ((_order$riderAssignmen2 = order.riderAssignment) === null || _order$riderAssignmen2 === void 0 ? void 0 : _order$riderAssignmen2.assignedAt) || new Date(),
            acceptedAt: new Date()
          });
          order.timeline.push({
            status: "assigned",
            timestamp: new Date(),
            note: "Order accepted by rider"
          });
          _context6.n = 5;
          return order.save();
        case 5:
          _riderCacheHelper.invalidateOrdersForRider().catch(function () {});
          return _context6.a(2, order);
      }
    }, _callee6);
  }));
  return function acceptOrder(_x0, _x1) {
    return _ref6.apply(this, arguments);
  };
}();
var rejectOrder = exports.rejectOrder = /*#__PURE__*/function () {
  var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7(orderId, riderId, reason) {
    var _order$riderAssignmen3;
    var order;
    return _regenerator().w(function (_context7) {
      while (1) switch (_context7.n) {
        case 0:
          _context7.n = 1;
          return _Order.Order.findById(orderId);
        case 1:
          order = _context7.v;
          if (order) {
            _context7.n = 2;
            break;
          }
          throw new Error("Order not found");
        case 2:
          if (!(((_order$riderAssignmen3 = order.riderAssignment) === null || _order$riderAssignmen3 === void 0 ? void 0 : _order$riderAssignmen3.riderId) !== riderId)) {
            _context7.n = 3;
            break;
          }
          throw new Error("Order not assigned to this rider");
        case 3:
          // Remove rider assignment and reset status
          order.riderAssignment = undefined;
          order.status = "confirmed";
          order.timeline.push({
            status: "confirmed",
            timestamp: new Date(),
            note: reason || "Order rejected by rider"
          });
          _context7.n = 4;
          return order.save();
        case 4:
          _riderCacheHelper.invalidateOrdersForRider().catch(function () {});
          return _context7.a(2, order);
      }
    }, _callee7);
  }));
  return function rejectOrder(_x10, _x11, _x12) {
    return _ref7.apply(this, arguments);
  };
}();