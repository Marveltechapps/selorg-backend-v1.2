"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.orderRouter = void 0;
var _express = require("express");
var _zod = require("zod");
var orderService = _interopRequireWildcard(require("./order.service.js"));
var _authenticate = require("../../middleware/authenticate.js");
var _multer = _interopRequireDefault(require("multer"));
var _crypto = _interopRequireDefault(require("crypto"));
var _s3 = require("../../services/s3.service.js");
var _appConfig = require("../../config/appConfig.js");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t8 in e) "default" !== _t8 && {}.hasOwnProperty.call(e, _t8) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t8)) && (i.get || i.set) ? o(f, _t8, i) : f[_t8] = e[_t8]); return f; })(e, t); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var proofOfDeliverySchema = _zod.z.object({
  type: _zod.z["enum"](["otp", "signature", "photo"]),
  value: _zod.z.string()
}).optional();
var orderRouter = exports.orderRouter = (0, _express.Router)();

// Used for delivery proof photo uploads (reuses existing S3 integration)
var upload = (0, _multer["default"])({
  storage: _multer["default"].memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }

// Delivery OTP helpers (stored in order.metadata to avoid schema/migrations)
var DELIVERY_OTP_EXPIRY_MINUTES = 5;
var DELIVERY_OTP_MESSAGE = "Your Selorg delivery OTP for order {orderNumber} is {otp}. It is valid for 5 minutes.";
function generateDeliveryOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
function buildDeliveryOtpSmsUrl(mobileNumber, otp, orderNumber) {
  var base = (0, _appConfig.getSmsVendorUrl)();
  if (!base) return null;
  var mobile = String(mobileNumber || "").replace(/\D/g, "").slice(-10);
  if (mobile.length !== 10) return null;
  var message = DELIVERY_OTP_MESSAGE.replace("{otp}", otp).replace("{orderNumber}", String(orderNumber || ""));
  var mobileParam = (0, _appConfig.getSmsToParam)();
  var msgParam = (0, _appConfig.getSmsMessageParam)();
  var sep = base.includes("?") && !base.endsWith("&") && !base.endsWith("?") ? "&" : "";
  return base + sep + mobileParam + "=" + encodeURIComponent(mobile) + "&" + msgParam + "=" + encodeURIComponent(message);
}
function sendDeliveryOtpSms(mobileNumber, otp, orderNumber) {
  var url = buildDeliveryOtpSmsUrl(mobileNumber, otp, orderNumber);
  if (!url) return Promise.resolve({ success: false, reason: "No SMS vendor URL or invalid mobile" });
  return fetch(url, { method: "GET" })
    .then(function (res) { return res.text().then(function (text) { return { status: res.status, ok: res.ok, body: text }; }); })
    .then(function (_ref) {
      var status = _ref.status, ok = _ref.ok, body = _ref.body;
      var bodyStr = (body || "").trim();
      var bodyLower = bodyStr.toLowerCase();
      var looksSuccess = /success|sent|submit|ok|accepted/.test(bodyLower) && !/fail|error|invalid|denied|reject/.test(bodyLower);
      try {
        var data = JSON.parse(bodyStr);
        var s = data && (data.status || data.Status || data.result);
        if (s != null && String(s).toLowerCase() === "success") looksSuccess = true;
        if (s != null && (/fail|error|invalid|denied/.test(String(s).toLowerCase()))) looksSuccess = false;
      } catch (_) {}
      return { success: !!(ok && looksSuccess), body: bodyStr, status: status };
    })
    .catch(function (err) {
      return { success: false, body: String(err && err.message || err), status: 0 };
    });
}

// Get order by ID
orderRouter.get("/:orderId", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(req, res) {
    var _order$riderAssignmen, order, _t;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          _context.p = 0;
          _context.n = 1;
          return orderService.getOrderById(req.params.orderId);
        case 1:
          order = _context.v;
          if (order) {
            _context.n = 2;
            break;
          }
          res.status(404).json({
            error: "Order not found"
          });
          return _context.a(2);
        case 2:
          if (!(!req.user || ((_order$riderAssignmen = order.riderAssignment) === null || _order$riderAssignmen === void 0 ? void 0 : _order$riderAssignmen.riderId) !== req.user.id)) {
            _context.n = 3;
            break;
          }
          res.status(403).json({
            error: "Access denied"
          });
          return _context.a(2);
        case 3:
          res.json({
            order: order
          });
          _context.n = 5;
          break;
        case 4:
          _context.p = 4;
          _t = _context.v;
          res.status(500).json({
            error: "Failed to fetch order"
          });
        case 5:
          return _context.a(2);
      }
    }, _callee, null, [[0, 4]]);
  }));
  return function (_x, _x2) {
    return _ref.apply(this, arguments);
  };
}());

// List all orders (admin endpoint - filtered by riderId)
orderRouter.get("/admin/orders", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(req, res) {
    var filters, limit, orders, _t2;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.p = _context2.n) {
        case 0:
          if (req.user) {
            _context2.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context2.a(2);
        case 1:
          _context2.p = 1;
          filters = {
            riderId: req.user.id // Only get orders for this rider
          };
          if (req.query.status) {
            filters.status = req.query.status;
          }
          if (req.query.darkstoreCode) {
            filters.darkstoreCode = req.query.darkstoreCode;
          }
          limit = req.query.limit ? parseInt(req.query.limit) : 50;
          _context2.n = 2;
          return orderService.listOrders(_objectSpread(_objectSpread({}, filters), {}, {
            limit: limit
          }));
        case 2:
          orders = _context2.v;
          res.json({
            orders: orders,
            count: orders.length
          });
          _context2.n = 4;
          break;
        case 3:
          _context2.p = 3;
          _t2 = _context2.v;
          res.status(500).json({
            error: "Failed to fetch orders"
          });
        case 4:
          return _context2.a(2);
      }
    }, _callee2, null, [[1, 3]]);
  }));
  return function (_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
}());

// Mark order as picked
orderRouter.post("/:orderId/pick", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(req, res) {
    var order, _t3;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.p = _context3.n) {
        case 0:
          if (req.user) {
            _context3.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context3.a(2);
        case 1:
          _context3.p = 1;
          _context3.n = 2;
          return orderService.markOrderPicked(req.params.orderId, req.user.id);
        case 2:
          order = _context3.v;
          if (order) {
            _context3.n = 3;
            break;
          }
          res.status(404).json({
            error: "Order not found"
          });
          return _context3.a(2);
        case 3:
          res.json({
            order: order
          });
          _context3.n = 5;
          break;
        case 4:
          _context3.p = 4;
          _t3 = _context3.v;
          if (_t3 instanceof Error) {
            res.status(400).json({
              error: _t3.message
            });
          } else {
            res.status(500).json({
              error: "Failed to mark order as picked"
            });
          }
        case 5:
          return _context3.a(2);
      }
    }, _callee3, null, [[1, 4]]);
  }));
  return function (_x5, _x6) {
    return _ref3.apply(this, arguments);
  };
}());

// Mark order as out for delivery
orderRouter.post("/:orderId/out-for-delivery", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(req, res) {
    var order, _t4;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.p = _context4.n) {
        case 0:
          if (req.user) {
            _context4.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context4.a(2);
        case 1:
          _context4.p = 1;
          _context4.n = 2;
          return orderService.markOrderOutForDelivery(req.params.orderId, req.user.id);
        case 2:
          order = _context4.v;
          if (order) {
            _context4.n = 3;
            break;
          }
          res.status(404).json({
            error: "Order not found"
          });
          return _context4.a(2);
        case 3:
          res.json({
            order: order
          });
          _context4.n = 5;
          break;
        case 4:
          _context4.p = 4;
          _t4 = _context4.v;
          if (_t4 instanceof Error) {
            res.status(400).json({
              error: _t4.message
            });
          } else {
            res.status(500).json({
              error: "Failed to update order status"
            });
          }
        case 5:
          return _context4.a(2);
      }
    }, _callee4, null, [[1, 4]]);
  }));
  return function (_x7, _x8) {
    return _ref4.apply(this, arguments);
  };
}());

// Mark order as delivered
orderRouter.post("/:orderId/deliver", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(req, res) {
    var parseResult, order, _t5;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.p = _context5.n) {
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
          // Accept both shapes for backward compatibility:
          // - { type, value } (preferred)
          // - { proofOfDelivery: { type, value } } (older client)
          parseResult = proofOfDeliverySchema.safeParse(req.body && req.body.proofOfDelivery ? req.body.proofOfDelivery : req.body);
          _context5.p = 2;
          _context5.n = 3;
          return orderService.markOrderDelivered(req.params.orderId, req.user.id, parseResult.success ? parseResult.data : undefined);
        case 3:
          order = _context5.v;
          if (order) {
            _context5.n = 4;
            break;
          }
          res.status(404).json({
            error: "Order not found"
          });
          return _context5.a(2);
        case 4:
          res.json({
            order: order
          });
          _context5.n = 6;
          break;
        case 5:
          _context5.p = 5;
          _t5 = _context5.v;
          if (_t5 instanceof Error) {
            res.status(400).json({
              error: _t5.message
            });
          } else {
            res.status(500).json({
              error: "Failed to mark order as delivered"
            });
          }
        case 6:
          return _context5.a(2);
      }
    }, _callee5, null, [[2, 5]]);
  }));
  return function (_x9, _x0) {
    return _ref5.apply(this, arguments);
  };
}());

/**
 * Mark COD payment as collected.
 * This makes the "Cash Collected" button a real backend operation.
 */
orderRouter.post("/:orderId/payment/mark-collected", _authenticate.authenticate, /*#__PURE__*/function () {
  var _refCollected = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _calleeCollected(req, res) {
    var orderId, riderId, order, _tCollected;
    return _regenerator().w(function (_contextCollected) {
      while (1) switch (_contextCollected.p = _contextCollected.n) {
        case 0:
          if (req.user) {
            _contextCollected.n = 1;
            break;
          }
          res.status(401).json({ error: "Unauthorized" });
          return _contextCollected.a(2);
        case 1:
          orderId = req.params.orderId;
          riderId = req.user.id;
          _contextCollected.p = 1;
          _contextCollected.n = 2;
          return orderService.getOrderById(orderId);
        case 2:
          order = _contextCollected.v;
          if (!order) {
            res.status(404).json({ error: "Order not found" });
            return _contextCollected.a(2);
          }
          if (!order.riderAssignment || order.riderAssignment.riderId !== riderId) {
            res.status(403).json({ error: "Access denied" });
            return _contextCollected.a(2);
          }
          if (!order.payment || order.payment.method !== "cod") {
            res.status(400).json({ error: "Order is not COD" });
            return _contextCollected.a(2);
          }
          if (order.payment.status !== "completed") {
            order.payment.status = "completed";
            order.metadata = order.metadata || {};
            order.metadata.codCollectedAt = new Date();
            order.timeline.push({
              status: "payment_collected",
              timestamp: new Date(),
              note: "COD marked as collected by rider"
            });
            _contextCollected.n = 3;
            return order.save();
          }
        case 3:
          res.json({ order: order });
          _contextCollected.n = 5;
          break;
        case 4:
          _contextCollected.p = 4;
          _tCollected = _contextCollected.v;
          res.status(500).json({ error: "Failed to mark COD as collected" });
        case 5:
          return _contextCollected.a(2);
      }
    }, _calleeCollected, null, [[1, 4]]);
  }));
  return function (_xCollectedReq, _xCollectedRes) {
    return _refCollected.apply(this, arguments);
  };
}());

/**
 * Get a UPI payment intent URI for this order.
 * Used by the rider app "Show QR" flow (it can open UPI apps with the URI).
 */
orderRouter.get("/:orderId/payment/upi-intent", _authenticate.authenticate, /*#__PURE__*/function () {
  var _refUpi = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _calleeUpi(req, res) {
    var orderId, riderId, order, vpa, payeeName, amount, upiUri, _tUpi;
    return _regenerator().w(function (_contextUpi) {
      while (1) switch (_contextUpi.p = _contextUpi.n) {
        case 0:
          if (req.user) {
            _contextUpi.n = 1;
            break;
          }
          res.status(401).json({ error: "Unauthorized" });
          return _contextUpi.a(2);
        case 1:
          orderId = req.params.orderId;
          riderId = req.user.id;
          _contextUpi.p = 1;
          _contextUpi.n = 2;
          return orderService.getOrderById(orderId);
        case 2:
          order = _contextUpi.v;
          if (!order) {
            res.status(404).json({ error: "Order not found" });
            return _contextUpi.a(2);
          }
          if (!order.riderAssignment || order.riderAssignment.riderId !== riderId) {
            res.status(403).json({ error: "Access denied" });
            return _contextUpi.a(2);
          }
          vpa = process.env.RIDER_UPI_VPA || process.env.UPI_VPA || "";
          if (!vpa) {
            res.status(503).json({ error: "UPI VPA not configured", code: "UPI_NOT_CONFIGURED" });
            return _contextUpi.a(2);
          }
          payeeName = process.env.RIDER_UPI_PAYEE_NAME || "Selorg";
          amount = order.payment && typeof order.payment.amount === "number" ? order.payment.amount : order.pricing && typeof order.pricing.total === "number" ? order.pricing.total : 0;
          upiUri = "upi://pay?pa=".concat(encodeURIComponent(vpa), "&pn=").concat(encodeURIComponent(payeeName), "&am=").concat(encodeURIComponent(String(amount)), "&cu=INR&tn=").concat(encodeURIComponent("Order ".concat(order.orderNumber)));
          res.json({
            upiUri: upiUri,
            vpa: vpa,
            payeeName: payeeName,
            amount: amount,
            orderNumber: order.orderNumber
          });
          _contextUpi.n = 4;
          break;
        case 3:
          _contextUpi.p = 3;
          _tUpi = _contextUpi.v;
          res.status(500).json({ error: "Failed to create UPI intent" });
        case 4:
          return _contextUpi.a(2);
      }
    }, _calleeUpi, null, [[1, 3]]);
  }));
  return function (_xUpiReq, _xUpiRes) {
    return _refUpi.apply(this, arguments);
  };
}());

/**
 * Upload delivery proof photo to S3 (returns public URL).
 * Rider app can then pass that URL as proofOfDelivery.value when delivering.
 */
orderRouter.post("/:orderId/proof/photo", _authenticate.authenticate, upload.single("file"), /*#__PURE__*/function () {
  var _refPhoto = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _calleePhoto(req, res) {
    var orderId, riderId, order, file, key, url, _tPhoto;
    return _regenerator().w(function (_contextPhoto) {
      while (1) switch (_contextPhoto.p = _contextPhoto.n) {
        case 0:
          if (req.user) {
            _contextPhoto.n = 1;
            break;
          }
          res.status(401).json({ error: "Unauthorized" });
          return _contextPhoto.a(2);
        case 1:
          orderId = req.params.orderId;
          riderId = req.user.id;
          if (req.file) {
            _contextPhoto.n = 2;
            break;
          }
          res.status(400).json({ error: "No file uploaded", code: "MISSING_FILE" });
          return _contextPhoto.a(2);
        case 2:
          _contextPhoto.p = 2;
          _contextPhoto.n = 3;
          return orderService.getOrderById(orderId);
        case 3:
          order = _contextPhoto.v;
          if (!order) {
            res.status(404).json({ error: "Order not found" });
            return _contextPhoto.a(2);
          }
          if (!order.riderAssignment || order.riderAssignment.riderId !== riderId) {
            res.status(403).json({ error: "Access denied" });
            return _contextPhoto.a(2);
          }
          file = req.file;
          if ((0, _s3.isS3Configured)()) {
            _contextPhoto.n = 4;
            break;
          }
          res.status(503).json({ error: "Upload service unavailable", code: "S3_NOT_CONFIGURED" });
          return _contextPhoto.a(2);
        case 4:
          key = "riders/".concat(riderId, "/orders/").concat(order.orderNumber, "/proof/").concat(Date.now(), "_").concat(_crypto["default"].randomBytes(4).toString("hex"), "_").concat((file.originalname || "photo.jpg").replace(/[^a-zA-Z0-9.-]/g, "_"));
          _contextPhoto.n = 5;
          return (0, _s3.uploadToS3)(file.buffer, key, file.mimetype, { bucket: "documents" });
        case 5:
          url = _contextPhoto.v;
          res.json({ url: url, key: key });
          _contextPhoto.n = 7;
          break;
        case 6:
          _contextPhoto.p = 6;
          _tPhoto = _contextPhoto.v;
          res.status(500).json({ error: "Failed to upload proof photo" });
        case 7:
          return _contextPhoto.a(2);
      }
    }, _calleePhoto, null, [[2, 6]]);
  }));
  return function (_xPhotoReq, _xPhotoRes) {
    return _refPhoto.apply(this, arguments);
  };
}());

/**
 * Send delivery OTP to the customer's phone number for this order.
 * Stores OTP + expiry in order.metadata.deliveryOtp / deliveryOtpExpiry.
 */
orderRouter.post("/:orderId/otp/send", _authenticate.authenticate, /*#__PURE__*/function () {
  var _refOtpSend = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _calleeOtpSend(req, res) {
    var orderId, riderId, order, otp, expiry, smsResult, _tOtpSend;
    return _regenerator().w(function (_contextOtpSend) {
      while (1) switch (_contextOtpSend.p = _contextOtpSend.n) {
        case 0:
          if (req.user) {
            _contextOtpSend.n = 1;
            break;
          }
          res.status(401).json({ error: "Unauthorized" });
          return _contextOtpSend.a(2);
        case 1:
          orderId = req.params.orderId;
          riderId = req.user.id;
          _contextOtpSend.p = 1;
          _contextOtpSend.n = 2;
          return orderService.getOrderById(orderId);
        case 2:
          order = _contextOtpSend.v;
          if (!order) {
            res.status(404).json({ error: "Order not found" });
            return _contextOtpSend.a(2);
          }
          if (!order.riderAssignment || order.riderAssignment.riderId !== riderId) {
            res.status(403).json({ error: "Access denied" });
            return _contextOtpSend.a(2);
          }
          // Prefer the phone stored on the order. If missing, allow client to supply it (fallback).
          // This mirrors the signin OTP flows where the client provides the target number.
          var targetPhone = order.customerPhoneNumber || (req.body && (req.body.mobileNumber || req.body.phoneNumber || req.body.phone));
          if (targetPhone) {
            var digits = String(targetPhone).replace(/\D/g, "").slice(-10);
            if (digits.length === 10) {
              targetPhone = digits;
              if (!order.customerPhoneNumber) {
                order.customerPhoneNumber = digits;
              }
            } else {
              targetPhone = null;
            }
          }
          if (!targetPhone) {
            res.status(400).json({ error: "Customer phone number missing" });
            return _contextOtpSend.a(2);
          }
          otp = generateDeliveryOtp();
          expiry = new Date(Date.now() + DELIVERY_OTP_EXPIRY_MINUTES * 60 * 1000);

          if (process.env.NODE_ENV === "development") {
            console.info("\x1b[36m%s\x1b[0m", "----------------------------------------");
            console.info("\x1b[36m%s\x1b[0m", "DELIVERY OTP (DEV LOG)");
            console.info("\x1b[36m%s\x1b[0m", "Order: " + order.orderNumber);
            console.info("\x1b[36m%s\x1b[0m", "Mobile: " + order.customerPhoneNumber);
            console.info("\x1b[36m%s\x1b[0m", "OTP: " + otp);
            console.info("\x1b[36m%s\x1b[0m", "----------------------------------------");
          }

          _contextOtpSend.n = 3;
          return sendDeliveryOtpSms(targetPhone, otp, order.orderNumber);
        case 3:
          smsResult = _contextOtpSend.v;
          if (!smsResult.success) {
            if (smsResult.body) console.warn("[orders] Delivery OTP SMS gateway failure — status:", smsResult.status, "body:", String(smsResult.body).substring(0, 200));
            if (process.env.NODE_ENV !== "development") {
              res.status(500).json({ error: "Failed to send OTP via SMS" });
              return _contextOtpSend.a(2);
            }
          }
          order.metadata = order.metadata || {};
          order.metadata.deliveryOtp = otp;
          order.metadata.deliveryOtpExpiry = expiry;
          order.metadata.deliveryOtpSentAt = new Date();
          order.timeline.push({
            status: "delivery_otp_sent",
            timestamp: new Date(),
            note: "Delivery OTP sent to customer"
          });
          _contextOtpSend.n = 4;
          return order.save();
        case 4:
          res.json({ message: "OTP sent successfully" + (process.env.NODE_ENV === "development" ? " (check backend console)" : ""), expiresInSec: DELIVERY_OTP_EXPIRY_MINUTES * 60 });
          _contextOtpSend.n = 6;
          break;
        case 5:
          _contextOtpSend.p = 5;
          _tOtpSend = _contextOtpSend.v;
          res.status(500).json({ error: "Failed to send OTP" });
        case 6:
          return _contextOtpSend.a(2);
      }
    }, _calleeOtpSend, null, [[1, 5]]);
  }));
  return function (_xOtpSendReq, _xOtpSendRes) {
    return _refOtpSend.apply(this, arguments);
  };
}());

/**
 * Verify delivery OTP for this order.
 * Clears OTP on success and records metadata.deliveryOtpVerifiedAt.
 */
orderRouter.post("/:orderId/otp/verify", _authenticate.authenticate, /*#__PURE__*/function () {
  var _refOtpVerify = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _calleeOtpVerify(req, res) {
    var orderId, riderId, otp, order, storedOtp, expiry, now, _tOtpVerify;
    return _regenerator().w(function (_contextOtpVerify) {
      while (1) switch (_contextOtpVerify.p = _contextOtpVerify.n) {
        case 0:
          if (req.user) {
            _contextOtpVerify.n = 1;
            break;
          }
          res.status(401).json({ error: "Unauthorized" });
          return _contextOtpVerify.a(2);
        case 1:
          orderId = req.params.orderId;
          riderId = req.user.id;
          otp = req.body && req.body.otp != null ? String(req.body.otp).trim() : "";
          if (otp && otp.length === 4) {
            _contextOtpVerify.n = 2;
            break;
          }
          res.status(400).json({ verified: false, error: "otp must be 4 digits" });
          return _contextOtpVerify.a(2);
        case 2:
          _contextOtpVerify.p = 2;
          _contextOtpVerify.n = 3;
          return orderService.getOrderById(orderId);
        case 3:
          order = _contextOtpVerify.v;
          if (!order) {
            res.status(404).json({ verified: false, error: "Order not found" });
            return _contextOtpVerify.a(2);
          }
          if (!order.riderAssignment || order.riderAssignment.riderId !== riderId) {
            res.status(403).json({ verified: false, error: "Access denied" });
            return _contextOtpVerify.a(2);
          }
          order.metadata = order.metadata || {};
          storedOtp = order.metadata.deliveryOtp != null ? String(order.metadata.deliveryOtp).trim() : "";
          expiry = order.metadata.deliveryOtpExpiry ? new Date(order.metadata.deliveryOtpExpiry) : null;
          now = new Date();
          if (!storedOtp) {
            res.status(400).json({ verified: false, message: "No OTP requested" });
            return _contextOtpVerify.a(2);
          }
          if (expiry && now > expiry) {
            res.status(400).json({ verified: false, message: "OTP expired" });
            return _contextOtpVerify.a(2);
          }
          if (storedOtp !== otp) {
            res.status(400).json({ verified: false, message: "Incorrect OTP" });
            return _contextOtpVerify.a(2);
          }
          order.metadata.deliveryOtp = null;
          order.metadata.deliveryOtpExpiry = null;
          order.metadata.deliveryOtpVerifiedAt = new Date();
          order.timeline.push({
            status: "delivery_otp_verified",
            timestamp: new Date(),
            note: "Delivery OTP verified"
          });
          _contextOtpVerify.n = 4;
          return order.save();
        case 4:
          res.json({ verified: true, message: "OTP verified" });
          _contextOtpVerify.n = 6;
          break;
        case 5:
          _contextOtpVerify.p = 5;
          _tOtpVerify = _contextOtpVerify.v;
          res.status(500).json({ verified: false, error: "Failed to verify OTP" });
        case 6:
          return _contextOtpVerify.a(2);
      }
    }, _calleeOtpVerify, null, [[2, 5]]);
  }));
  return function (_xOtpVerifyReq, _xOtpVerifyRes) {
    return _refOtpVerify.apply(this, arguments);
  };
}());

// Accept order assignment
orderRouter.post("/:orderId/accept", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(req, res) {
    var order, _t6;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.p = _context6.n) {
        case 0:
          if (req.user) {
            _context6.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context6.a(2);
        case 1:
          _context6.p = 1;
          _context6.n = 2;
          return orderService.acceptOrder(req.params.orderId, req.user.id);
        case 2:
          order = _context6.v;
          if (order) {
            _context6.n = 3;
            break;
          }
          res.status(404).json({
            error: "Order not found"
          });
          return _context6.a(2);
        case 3:
          res.json({
            order: order
          });
          _context6.n = 5;
          break;
        case 4:
          _context6.p = 4;
          _t6 = _context6.v;
          if (_t6 instanceof Error) {
            res.status(400).json({
              error: _t6.message
            });
          } else {
            res.status(500).json({
              error: "Failed to accept order"
            });
          }
        case 5:
          return _context6.a(2);
      }
    }, _callee6, null, [[1, 4]]);
  }));
  return function (_x1, _x10) {
    return _ref6.apply(this, arguments);
  };
}());

// Reject order assignment
orderRouter.post("/:orderId/reject", _authenticate.authenticate, /*#__PURE__*/function () {
  var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7(req, res) {
    var reason, order, _t7;
    return _regenerator().w(function (_context7) {
      while (1) switch (_context7.p = _context7.n) {
        case 0:
          if (req.user) {
            _context7.n = 1;
            break;
          }
          res.status(401).json({
            error: "Unauthorized"
          });
          return _context7.a(2);
        case 1:
          _context7.p = 1;
          reason = typeof req.body.reason === "string" ? req.body.reason : undefined;
          _context7.n = 2;
          return orderService.rejectOrder(req.params.orderId, req.user.id, reason);
        case 2:
          order = _context7.v;
          if (order) {
            _context7.n = 3;
            break;
          }
          res.status(404).json({
            error: "Order not found"
          });
          return _context7.a(2);
        case 3:
          res.json({
            order: order
          });
          _context7.n = 5;
          break;
        case 4:
          _context7.p = 4;
          _t7 = _context7.v;
          if (_t7 instanceof Error) {
            res.status(400).json({
              error: _t7.message
            });
          } else {
            res.status(500).json({
              error: "Failed to reject order"
            });
          }
        case 5:
          return _context7.a(2);
      }
    }, _callee7, null, [[1, 4]]);
  }));
  return function (_x11, _x12) {
    return _ref7.apply(this, arguments);
  };
}());