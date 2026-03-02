"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Payment = void 0;
var _mongoose = _interopRequireWildcard(require("mongoose"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
var PaymentSchema = new _mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  riderId: {
    type: String,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    "default": "INR"
  },
  paymentMethod: {
    type: String,
    "enum": ["stripe", "razorpay", "paypal", "upi", "cod", "card", "wallet"],
    required: true
  },
  status: {
    type: String,
    "enum": ["pending", "processing", "completed", "failed", "refunded", "canceled"],
    "default": "pending",
    index: true
  },
  gateway: {
    type: String,
    required: true
  },
  gatewayTransactionId: {
    type: String,
    index: true
  },
  metadata: {
    type: _mongoose.Schema.Types.Mixed
  },
  refundedAmount: {
    type: Number
  },
  refundedAt: {
    type: Date
  }
}, {
  timestamps: true
});
PaymentSchema.index({
  orderId: 1,
  status: 1
});
PaymentSchema.index({
  riderId: 1,
  status: 1
});
PaymentSchema.index({
  createdAt: -1
});
var Payment = exports.Payment = _mongoose["default"].model("Payment", PaymentSchema);