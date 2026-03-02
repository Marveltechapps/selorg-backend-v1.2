"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getEarningsSummary = exports.getRiderPayouts = exports.getPayoutStatement = exports.getPayoutById = exports.createPayoutRequest = exports.calculateEarnings = void 0;
var _nodeCrypto = require("node:crypto");
var _Payout = require("../../models/Payout.js");
var _Rider = require("../../models/Rider.js");
var _Order = require("../../models/Order.js");
var _riderCacheHelper = require("../../utils/riderCacheHelper.js");
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var generatePayoutNumber = function generatePayoutNumber() {
  var timestamp = Date.now().toString().slice(-6);
  var random = (0, _nodeCrypto.randomUUID)().slice(0, 4).toUpperCase();
  return "PAY-".concat(timestamp, "-").concat(random);
};
var calculateEarnings = exports.calculateEarnings = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(riderId, periodStart, periodEnd) {
    var orders, baseAmount, orderIds, incentiveAmount, deliveryCount, penaltyAmount, grossAmount, taxAmount, totalAmount;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          _context.n = 1;
          return _Order.Order.find({
            "riderAssignment.riderId": riderId,
            status: "delivered",
            "riderAssignment.deliveredAt": {
              $gte: periodStart,
              $lte: periodEnd
            }
          });
        case 1:
          orders = _context.v;
          baseAmount = 0;
          orderIds = [];
          orders.forEach(function (order) {
            baseAmount += order.pricing.deliveryFee || 30;
            orderIds.push(String(order._id));
          });
          incentiveAmount = 0;
          deliveryCount = orders.length;
          if (deliveryCount >= 20) {
            incentiveAmount += 200;
          }
          if (deliveryCount >= 50) {
            incentiveAmount += 500;
          }
          penaltyAmount = 0;
          grossAmount = baseAmount + incentiveAmount - penaltyAmount;
          taxAmount = grossAmount > 10000 ? Math.floor(grossAmount * 0.05) : 0;
          totalAmount = grossAmount - taxAmount;
          return _context.a(2, {
            baseAmount: baseAmount,
            incentiveAmount: incentiveAmount,
            penaltyAmount: penaltyAmount,
            taxAmount: taxAmount,
            totalAmount: totalAmount,
            orderIds: orderIds
          });
      }
    }, _callee);
  }));
  return function calculateEarnings(_x, _x2, _x3) {
    return _ref.apply(this, arguments);
  };
}();
var getEarningsSummaryUncached = /*#__PURE__*/function () {
  var _refE = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _calleeE(riderId, period) {
    var now, periodStart, periodEnd, earnings, dayNames, dailyAgg;
    return _regenerator().w(function (_contextE) {
      while (1) switch (_contextE.n) {
        case 0:
          now = new Date();
          periodStart = new Date(now);
          periodEnd = new Date(now);
          if (period === 'today') {
            periodStart.setHours(0, 0, 0, 0);
            periodEnd.setHours(23, 59, 59, 999);
          } else if (period === 'week') {
            var day = periodStart.getDay();
            var diff = periodStart.getDate() - day + (day === 0 ? -6 : 1);
            periodStart.setDate(diff);
            periodStart.setHours(0, 0, 0, 0);
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + 6);
            periodEnd.setHours(23, 59, 59, 999);
          } else {
            periodStart.setDate(1);
            periodStart.setHours(0, 0, 0, 0);
            periodEnd.setMonth(periodEnd.getMonth() + 1, 0);
            periodEnd.setHours(23, 59, 59, 999);
          }
          _contextE.n = 1;
          return calculateEarnings(riderId, periodStart, periodEnd);
        case 1:
          earnings = _contextE.v;
          if (period !== "week") {
            return _contextE.a(2, {
              totalEarnings: earnings.totalAmount,
              orderCount: (earnings.orderIds || []).length,
              periodStart: periodStart.toISOString(),
              periodEnd: periodEnd.toISOString()
            });
          }
          dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          _contextE.n = 2;
          return _Order.Order.aggregate([
            { $match: { 'riderAssignment.riderId': riderId, status: 'delivered', 'riderAssignment.deliveredAt': { $gte: periodStart, $lte: periodEnd } } },
            { $group: { _id: { $dayOfWeek: '$riderAssignment.deliveredAt' }, total: { $sum: { $ifNull: ['$pricing.deliveryFee', 30] } }, count: { $sum: 1 } } }
          ]);
        case 2:
          dailyAgg = _contextE.v;
          return _contextE.a(2, {
            totalEarnings: earnings.totalAmount,
            orderCount: (earnings.orderIds || []).length,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            dailyBreakdown: dayNames.map(function (label, idx) {
              var dow = [2, 3, 4, 5, 6, 7, 1][idx];
              var doc = dailyAgg.find(function (d) { return d._id === dow; });
              return { dayLabel: label, value: doc ? doc.total : 0, orderCount: doc ? doc.count : 0 };
            })
          });
      }
    }, _calleeE);
  }));
  return function getEarningsSummaryUncached(_xE, _xE2) {
    return _refE.apply(this, arguments);
  };
}();
var getEarningsSummary = exports.getEarningsSummary = /*#__PURE__*/function () {
  var _refEwrap = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _calleeEwrap(riderId, period) {
    var key;
    return _regenerator().w(function (_contextEwrap) {
      while (1) switch (_contextEwrap.n) {
        case 0:
          key = "rider:earnings:".concat(riderId, ":").concat(period);
          return _contextEwrap.a(2, _riderCacheHelper.getCachedOrCompute(key, 60, function () { return getEarningsSummaryUncached(riderId, period); }));
      }
    }, _calleeEwrap);
  }));
  return function getEarningsSummary(_xE, _xE2) {
    return _refEwrap.apply(this, arguments);
  };
}();
var createPayoutRequest = exports.createPayoutRequest = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(input) {
    var earnings, pendingPayout, payoutNumber, payout, rider;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          _context2.n = 1;
          return calculateEarnings(input.riderId, input.periodStart, input.periodEnd);
        case 1:
          earnings = _context2.v;
          if (!(earnings.totalAmount < 100)) {
            _context2.n = 2;
            break;
          }
          throw new Error("Minimum payout amount is ₹100");
        case 2:
          _context2.n = 3;
          return _Payout.Payout.findOne({
            riderId: input.riderId,
            status: {
              $in: ["pending", "approved", "processing"]
            }
          });
        case 3:
          pendingPayout = _context2.v;
          if (!pendingPayout) {
            _context2.n = 4;
            break;
          }
          throw new Error("You have a pending payout request. Please wait for it to be processed.");
        case 4:
          payoutNumber = generatePayoutNumber();
          payout = new _Payout.Payout({
            payoutNumber: payoutNumber,
            riderId: input.riderId,
            riderPhoneNumber: input.riderPhoneNumber,
            amount: earnings.totalAmount,
            baseAmount: earnings.baseAmount,
            incentiveAmount: earnings.incentiveAmount,
            penaltyAmount: earnings.penaltyAmount,
            taxAmount: earnings.taxAmount,
            method: input.method,
            accountDetails: input.accountDetails,
            status: "pending",
            requestedAt: new Date(),
            orderIds: earnings.orderIds,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            notes: []
          });
          _context2.n = 5;
          return payout.save();
        case 5:
          _context2.n = 6;
          return _Rider.Rider.findOne({
            riderId: input.riderId
          });
        case 6:
          rider = _context2.v;
          if (!rider) {
            _context2.n = 7;
            break;
          }
          rider.earnings.pendingAmount -= earnings.totalAmount;
          _context2.n = 7;
          return rider.save();
        case 7:
          _riderCacheHelper.invalidatePayoutsForRider(input.riderId).catch(function () {});
          return _context2.a(2, payout);
      }
    }, _callee2);
  }));
  return function createPayoutRequest(_x4) {
    return _ref2.apply(this, arguments);
  };
}();
var getRiderPayouts = exports.getRiderPayouts = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(riderId) {
    var limit, key, compute, _args3 = arguments;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          limit = _args3.length > 1 && _args3[1] !== undefined ? _args3[1] : 20;
          key = "rider:payouts:".concat(riderId, ":").concat(limit);
          compute = /*#__PURE__*/function () {
            var _ref3in = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3in() {
              return _regenerator().w(function (_context3in) {
                switch (_context3in.n) {
                  case 0:
                    return _context3in.a(2, _Payout.Payout.find({ riderId: riderId }).sort({ requestedAt: -1 }).limit(limit).lean());
                }
              }, _callee3in);
            }));
            return function compute() { return _ref3in.apply(this, arguments); };
          }();
          return _context3.a(2, _riderCacheHelper.getCachedOrCompute(key, 30, compute));
      }
    }, _callee3);
  }));
  return function getRiderPayouts(_x5) {
    return _ref3.apply(this, arguments);
  };
}();
var getPayoutById = exports.getPayoutById = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(payoutId) {
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.n) {
        case 0:
          return _context4.a(2, _Payout.Payout.findById(payoutId));
      }
    }, _callee4);
  }));
  return function getPayoutById(_x6) {
    return _ref4.apply(this, arguments);
  };
}();
var getPayoutStatement = exports.getPayoutStatement = /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(riderId, startDate, endDate) {
    var payouts, totalEarnings, baseEarnings, incentives, penalties, tax, orders;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          _context5.n = 1;
          return _Payout.Payout.find({
            riderId: riderId,
            requestedAt: {
              $gte: startDate,
              $lte: endDate
            }
          });
        case 1:
          payouts = _context5.v;
          totalEarnings = payouts.reduce(function (sum, p) {
            return sum + p.baseAmount + p.incentiveAmount;
          }, 0);
          baseEarnings = payouts.reduce(function (sum, p) {
            return sum + p.baseAmount;
          }, 0);
          incentives = payouts.reduce(function (sum, p) {
            return sum + p.incentiveAmount;
          }, 0);
          penalties = payouts.reduce(function (sum, p) {
            return sum + p.penaltyAmount;
          }, 0);
          tax = payouts.reduce(function (sum, p) {
            return sum + p.taxAmount;
          }, 0); // Get orders for the period
          _context5.n = 2;
          return _Order.Order.find({
            "riderAssignment.riderId": riderId,
            status: "delivered",
            "riderAssignment.deliveredAt": {
              $gte: startDate,
              $lte: endDate
            }
          }).select("_id orderNumber pricing.deliveryFee riderAssignment.deliveredAt");
        case 2:
          orders = _context5.v;
          return _context5.a(2, {
            periodStart: startDate,
            periodEnd: endDate,
            totalEarnings: totalEarnings,
            breakdown: {
              baseEarnings: baseEarnings,
              incentives: incentives,
              penalties: penalties,
              tax: tax
            },
            orders: orders.map(function (order) {
              var _order$riderAssignmen;
              return {
                orderId: String(order._id),
                orderNumber: order.orderNumber,
                amount: order.pricing.deliveryFee || 30,
                completedAt: ((_order$riderAssignmen = order.riderAssignment) === null || _order$riderAssignmen === void 0 ? void 0 : _order$riderAssignmen.deliveredAt) || order.createdAt
              };
            })
          });
      }
    }, _callee5);
  }));
  return function getPayoutStatement(_x7, _x8, _x9) {
    return _ref5.apply(this, arguments);
  };
}();