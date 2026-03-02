"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.reconciliationService = exports.ReconciliationService = void 0;
var _Payment = require("../../models/Payment.js");
var _Order = require("../../models/Order.js");
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * Payment reconciliation service
 */
var ReconciliationService = exports.ReconciliationService = /*#__PURE__*/function () {
  function ReconciliationService() {
    _classCallCheck(this, ReconciliationService);
  }
  return _createClass(ReconciliationService, [{
    key: "reconcilePayments",
    value: (
    /**
     * Reconcile payments for a date range
     */
    function () {
      var _reconcilePayments = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(startDate, endDate) {
        var records, payments, _iterator, _step, payment, order, expectedAmount, actualAmount, _t;
        return _regenerator().w(function (_context) {
          while (1) switch (_context.p = _context.n) {
            case 0:
              records = []; // Fetch all payments in date range
              _context.n = 1;
              return _Payment.Payment.find({
                createdAt: {
                  $gte: startDate,
                  $lte: endDate
                }
              });
            case 1:
              payments = _context.v;
              _iterator = _createForOfIteratorHelper(payments);
              _context.p = 2;
              _iterator.s();
            case 3:
              if ((_step = _iterator.n()).done) {
                _context.n = 7;
                break;
              }
              payment = _step.value;
              _context.n = 4;
              return _Order.Order.findOne({
                "payment.transactionId": payment.transactionId
              });
            case 4:
              order = _context.v;
              if (order) {
                _context.n = 5;
                break;
              }
              records.push({
                paymentId: String(payment._id),
                orderId: "unknown",
                amount: payment.amount,
                status: "discrepancy",
                discrepancy: {
                  expected: 0,
                  actual: payment.amount,
                  reason: "Order not found for payment"
                }
              });
              return _context.a(3, 6);
            case 5:
              // Compare amounts
              expectedAmount = order.pricing.total;
              actualAmount = payment.amount;
              if (expectedAmount === actualAmount) {
                records.push({
                  paymentId: String(payment._id),
                  orderId: String(order._id),
                  amount: actualAmount,
                  status: "matched",
                  reconciledAt: new Date()
                });
              } else {
                records.push({
                  paymentId: String(payment._id),
                  orderId: String(order._id),
                  amount: actualAmount,
                  status: "discrepancy",
                  discrepancy: {
                    expected: expectedAmount,
                    actual: actualAmount,
                    reason: "Amount mismatch"
                  }
                });
              }
            case 6:
              _context.n = 3;
              break;
            case 7:
              _context.n = 9;
              break;
            case 8:
              _context.p = 8;
              _t = _context.v;
              _iterator.e(_t);
            case 9:
              _context.p = 9;
              _iterator.f();
              return _context.f(9);
            case 10:
              return _context.a(2, records);
          }
        }, _callee, null, [[2, 8, 9, 10]]);
      }));
      function reconcilePayments(_x, _x2) {
        return _reconcilePayments.apply(this, arguments);
      }
      return reconcilePayments;
    }()
    /**
     * Resolve a reconciliation discrepancy
     */
    )
  }, {
    key: "resolveDiscrepancy",
    value: (function () {
      var _resolveDiscrepancy = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(paymentId, resolution) {
        var payment;
        return _regenerator().w(function (_context2) {
          while (1) switch (_context2.n) {
            case 0:
              _context2.n = 1;
              return _Payment.Payment.findById(paymentId);
            case 1:
              payment = _context2.v;
              if (payment) {
                _context2.n = 2;
                break;
              }
              throw new Error("Payment not found");
            case 2:
              // Update payment status based on resolution
              if (resolution.action === "accept") {
                payment.status = "completed";
              } else if (resolution.action === "refund") {
                payment.status = "refunded";
              } else if (resolution.action === "adjust") {
                payment.amount = resolution.adjustedAmount || payment.amount;
                payment.status = "completed";
              }
              payment.metadata = _objectSpread(_objectSpread({}, payment.metadata), {}, {
                reconciliation: {
                  resolvedAt: new Date(),
                  resolution: resolution
                }
              });
              _context2.n = 3;
              return payment.save();
            case 3:
              return _context2.a(2);
          }
        }, _callee2);
      }));
      function resolveDiscrepancy(_x3, _x4) {
        return _resolveDiscrepancy.apply(this, arguments);
      }
      return resolveDiscrepancy;
    }()
    /**
     * Get reconciliation report
     */
    )
  }, {
    key: "getReconciliationReport",
    value: (function () {
      var _getReconciliationReport = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(startDate, endDate) {
        var records, summary;
        return _regenerator().w(function (_context3) {
          while (1) switch (_context3.n) {
            case 0:
              _context3.n = 1;
              return this.reconcilePayments(startDate, endDate);
            case 1:
              records = _context3.v;
              summary = {
                total: records.length,
                matched: records.filter(function (r) {
                  return r.status === "matched";
                }).length,
                discrepancies: records.filter(function (r) {
                  return r.status === "discrepancy";
                }).length,
                pending: records.filter(function (r) {
                  return r.status === "pending";
                }).length,
                totalAmount: records.reduce(function (sum, r) {
                  return sum + r.amount;
                }, 0),
                discrepancyAmount: records.filter(function (r) {
                  return r.status === "discrepancy";
                }).reduce(function (sum, r) {
                  var _r$discrepancy, _r$discrepancy2;
                  return sum + (((_r$discrepancy = r.discrepancy) === null || _r$discrepancy === void 0 ? void 0 : _r$discrepancy.actual) || 0) - (((_r$discrepancy2 = r.discrepancy) === null || _r$discrepancy2 === void 0 ? void 0 : _r$discrepancy2.expected) || 0);
                }, 0)
              };
              return _context3.a(2, {
                summary: summary,
                records: records
              });
          }
        }, _callee3, this);
      }));
      function getReconciliationReport(_x5, _x6) {
        return _getReconciliationReport.apply(this, arguments);
      }
      return getReconciliationReport;
    }())
  }]);
}(); // Export singleton instance
var reconciliationService = exports.reconciliationService = new ReconciliationService();