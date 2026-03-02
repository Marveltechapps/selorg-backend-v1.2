"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FulfillmentTask = void 0;
var _mongoose = _interopRequireWildcard(require("mongoose"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
var FulfillmentTaskSchema = new _mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    "enum": ["pickup", "pack", "handoff", "delivery"],
    required: true
  },
  priority: {
    type: String,
    "enum": ["high", "medium", "low"],
    "default": "medium",
    index: true
  },
  status: {
    type: String,
    "enum": ["pending", "in_progress", "blocked", "complete"],
    "default": "pending",
    index: true
  },
  etaMinutes: {
    type: Number,
    required: true,
    min: 0
  },
  customerName: {
    type: String,
    required: true
  },
  addressSummary: {
    type: String,
    required: true
  },
  warehouseCode: {
    type: String,
    required: true,
    index: true
  },
  assignedRiderId: {
    type: String,
    index: true
  },
  notes: String,
  startedAt: Date,
  completedAt: Date
}, {
  timestamps: true
});
FulfillmentTaskSchema.index({
  warehouseCode: 1,
  status: 1
});
FulfillmentTaskSchema.index({
  assignedRiderId: 1,
  status: 1
});
var FulfillmentTask = exports.FulfillmentTask = _mongoose["default"].model("FulfillmentTask", FulfillmentTaskSchema);