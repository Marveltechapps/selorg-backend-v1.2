"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Order = void 0;
var _mongoose = _interopRequireWildcard(require("mongoose"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
var OrderSchema = new _mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerPhoneNumber: {
    type: String,
    required: true,
    index: true
  },
  warehouseCode: {
    type: String,
    required: true,
    index: true
  },
  items: [{
    skuId: {
      type: String,
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unit: {
      type: String,
      required: true
    },
    pricePerUnit: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  delivery: {
    address: {
      addressLine1: {
        type: String,
        required: true
      },
      addressLine2: String,
      city: {
        type: String,
        required: true
      },
      state: {
        type: String,
        required: true
      },
      pincode: {
        type: String,
        required: true
      },
      landmark: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    slot: {
      type: String,
      "enum": ["asap", "scheduled"],
      required: true
    },
    scheduledTime: Date,
    instructions: String
  },
  payment: {
    method: {
      type: String,
      "enum": ["cod", "card", "upi", "wallet"],
      required: true
    },
    status: {
      type: String,
      "enum": ["pending", "completed", "failed", "refunded"],
      required: true,
      "default": "pending"
    },
    transactionId: String,
    amount: {
      type: Number,
      required: true,
      min: 0
    }
  },
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      "default": 0
    },
    tax: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  status: {
    type: String,
    "enum": ["placed", "confirmed", "assigned", "picked", "out_for_delivery", "delivered", "cancelled"],
    required: true,
    "default": "placed",
    index: true
  },
  riderAssignment: {
    riderId: String,
    assignedAt: Date,
    acceptedAt: Date,
    pickedAt: Date,
    deliveredAt: Date
  },
  timeline: [{
    status: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      required: true,
      "default": Date.now
    },
    note: String
  }],
  metadata: {
    type: _mongoose.Schema.Types.Mixed,
    "default": {}
  }
}, {
  timestamps: true
});
OrderSchema.index({
  createdAt: -1
});
OrderSchema.index({
  "riderAssignment.riderId": 1
});
var Order = exports.Order = _mongoose["default"].models.RiderV2Order || _mongoose["default"].model("RiderV2Order", OrderSchema);