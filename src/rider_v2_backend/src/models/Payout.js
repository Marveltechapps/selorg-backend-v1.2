"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Payout = void 0;
var _mongoose = _interopRequireWildcard(require("mongoose"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
var PayoutSchema = new _mongoose.Schema({
  payoutNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  riderId: {
    type: String,
    required: true,
    index: true
  },
  riderPhoneNumber: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  baseAmount: {
    type: Number,
    required: true
  },
  incentiveAmount: {
    type: Number,
    "default": 0
  },
  penaltyAmount: {
    type: Number,
    "default": 0
  },
  taxAmount: {
    type: Number,
    "default": 0
  },
  method: {
    type: String,
    "enum": ["bank_transfer", "upi", "wallet"],
    required: true
  },
  accountDetails: {
    accountNumber: {
      type: String
    },
    ifscCode: {
      type: String
    },
    upiId: {
      type: String
    },
    walletId: {
      type: String
    },
    bankName: {
      type: String
    },
    accountHolderName: {
      type: String
    }
  },
  status: {
    type: String,
    "enum": ["pending", "approved", "processing", "completed", "rejected"],
    "default": "pending"
  },
  requestedAt: {
    type: Date,
    "default": Date.now
  },
  approvedAt: {
    type: Date
  },
  approvedBy: {
    type: String
  },
  processedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  rejectedAt: {
    type: Date
  },
  rejectedBy: {
    type: String
  },
  rejectionReason: {
    type: String
  },
  orderIds: [{
    type: String
  }],
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  transactionId: {
    type: String
  },
  transactionReference: {
    type: String
  },
  notes: [{
    type: String
  }]
}, {
  timestamps: true
});
PayoutSchema.index({
  payoutNumber: 1
});
PayoutSchema.index({
  riderId: 1
});
PayoutSchema.index({
  status: 1
});
PayoutSchema.index({
  requestedAt: -1
});
PayoutSchema.index({
  periodStart: 1,
  periodEnd: 1
});
var Payout = exports.Payout = _mongoose["default"].model("Payout", PayoutSchema);