"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Incident = void 0;
var _mongoose = _interopRequireWildcard(require("mongoose"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
var IncidentSchema = new _mongoose.Schema({
  incidentNumber: {
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
  type: {
    type: String,
    "enum": ["accident", "customer_issue", "vehicle_breakdown", "safety_concern", "other"],
    required: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  location: {
    lat: {
      type: Number
    },
    lng: {
      type: Number
    },
    address: {
      type: String
    }
  },
  photos: [String],
  status: {
    type: String,
    "enum": ["pending", "acknowledged", "resolved", "closed"],
    "default": "pending"
  },
  priority: {
    type: String,
    "enum": ["low", "medium", "high", "urgent"],
    "default": "medium"
  },
  reportedAt: {
    type: Date,
    "default": Date.now
  },
  acknowledgedAt: Date,
  resolvedAt: Date,
  resolution: String,
  acknowledgedBy: String,
  resolvedBy: String
}, {
  timestamps: true
});
IncidentSchema.index({
  riderId: 1,
  status: 1
});
IncidentSchema.index({
  status: 1,
  priority: 1
});
IncidentSchema.index({
  reportedAt: -1
});
var Incident = exports.Incident = _mongoose["default"].model("Incident", IncidentSchema);