"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Rider = void 0;
var _mongoose = _interopRequireWildcard(require("mongoose"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
var RiderSchema = new _mongoose.Schema({
  riderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: String,
  profilePicture: String,
  documents: {
    aadhar: {
      number: String,
      verified: {
        type: Boolean,
        "default": false
      },
      documentUrl: String
    },
    drivingLicense: {
      number: String,
      verified: {
        type: Boolean,
        "default": false
      },
      documentUrl: String,
      expiryDate: Date
    },
    vehicleRC: {
      number: String,
      verified: {
        type: Boolean,
        "default": false
      },
      documentUrl: String
    }
  },
  vehicle: {
    type: {
      type: String,
      "enum": ["bike", "scooter", "bicycle"],
      required: true
    },
    registrationNumber: String,
    model: String
  },
  status: {
    type: String,
    "enum": ["pending", "approved", "active", "inactive", "suspended"],
    "default": "pending",
    index: true
  },
  currentShift: {
    shiftId: String,
    startedAt: Date,
    warehouseCode: String
  },
  currentLocation: {
    lat: Number,
    lng: Number,
    updatedAt: Date
  },
  preferredLocation: {
    latitude: Number,
    longitude: Number,
    addressLabel: String,
    cityId: String,
    cityName: String,
    hubId: String,
    hubName: String,
    updatedAt: Date
  },
  availability: {
    type: String,
    "enum": ["available", "busy", "offline"],
    "default": "offline",
    index: true
  },
  stats: {
    totalDeliveries: {
      type: Number,
      "default": 0
    },
    completedDeliveries: {
      type: Number,
      "default": 0
    },
    cancelledDeliveries: {
      type: Number,
      "default": 0
    },
    averageRating: {
      type: Number,
      "default": 0
    },
    totalRatings: {
      type: Number,
      "default": 0
    }
  },
  earnings: {
    totalEarned: {
      type: Number,
      "default": 0
    },
    pendingAmount: {
      type: Number,
      "default": 0
    },
    lastPayoutAt: Date
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String
  },
  mfa: {
    enabled: {
      type: Boolean,
      "default": false
    },
    secret: String,
    backupCodes: [{
      code: String,
      used: {
        type: Boolean,
        "default": false
      }
    }]
  },
  role: {
    type: String,
    "enum": ["rider", "admin", "dispatcher", "support"],
    "default": "rider",
    index: true
  },
  failedLoginAttempts: {
    type: Number,
    "default": 0
  },
  accountLockedUntil: Date,
  otp: {
    type: String,
    "default": null
  },
  otpExpiry: {
    type: Date,
    "default": null
  },
  isVerified: {
    type: Boolean,
    "default": false
  },
  trustedDevices: [{
    deviceId: String,
    deviceName: String,
    lastUsed: Date
  }],
  sessions: [{
    sessionId: String,
    deviceId: String,
    deviceName: String,
    ipAddress: String,
    userAgent: String,
    createdAt: Date,
    lastActivity: Date
  }]
}, {
  timestamps: true
});
RiderSchema.index({
  currentLocation: "2dsphere"
});
RiderSchema.index({
  availability: 1,
  status: 1
});
var Rider = exports.Rider = _mongoose["default"].model("Rider", RiderSchema);