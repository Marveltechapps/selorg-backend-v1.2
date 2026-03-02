"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.pricingService = exports.PricingService = void 0;
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * Dynamic pricing service for surge pricing
 */
var PricingService = exports.PricingService = /*#__PURE__*/function () {
  function PricingService() {
    _classCallCheck(this, PricingService);
    _defineProperty(this, "BASE_DELIVERY_FEE", 30);
    // Base delivery fee in INR
    _defineProperty(this, "DISTANCE_RATE", 2);
    // Per km rate
    _defineProperty(this, "MAX_SURGE_MULTIPLIER", 3.0);
    // Maximum 3x surge
    _defineProperty(this, "MIN_SURGE_MULTIPLIER", 1.0);
  }
  return _createClass(PricingService, [{
    key: "calculateDynamicPrice",
    value:
    /**
     * Calculate dynamic price based on various factors
     */
    function calculateDynamicPrice(factors) {
      // Base price
      var basePrice = factors.basePrice || this.BASE_DELIVERY_FEE;

      // Distance fee
      var distanceFee = factors.distance * this.DISTANCE_RATE;

      // Demand multiplier (0.5 to 2.0 based on demand level)
      var demandMultiplier = 0.5 + factors.demandLevel * 1.5;
      var cappedDemandMultiplier = Math.min(this.MAX_SURGE_MULTIPLIER, Math.max(this.MIN_SURGE_MULTIPLIER, demandMultiplier));

      // Time of day multiplier
      var timeMultiplier = this.getTimeMultiplier(factors.timeOfDay);

      // Rider availability multiplier (inverse: fewer riders = higher price)
      var availabilityMultiplier = 1.0 + (1.0 - factors.riderAvailability) * 0.5;

      // Zone multiplier (if applicable)
      var zoneMultiplier = factors.zoneMultiplier || 1.0;

      // Calculate surge (demand + time + availability)
      var surgeMultiplier = cappedDemandMultiplier * timeMultiplier * availabilityMultiplier;

      // Calculate total
      var baseTotal = basePrice + distanceFee;
      var surgeAmount = baseTotal * (surgeMultiplier - 1.0);
      var zoneAmount = baseTotal * (zoneMultiplier - 1.0);
      var totalPrice = baseTotal + surgeAmount + zoneAmount;
      return {
        basePrice: basePrice,
        distanceFee: distanceFee,
        demandMultiplier: cappedDemandMultiplier,
        timeMultiplier: timeMultiplier,
        availabilityMultiplier: availabilityMultiplier,
        zoneMultiplier: zoneMultiplier,
        totalPrice: Math.round(totalPrice * 100) / 100,
        // Round to 2 decimal places
        breakdown: {
          base: basePrice,
          distance: distanceFee,
          surge: surgeAmount,
          zone: zoneAmount
        }
      };
    }

    /**
     * Get time-based multiplier
     */
  }, {
    key: "getTimeMultiplier",
    value: function getTimeMultiplier(timeOfDay) {
      switch (timeOfDay) {
        case "peak":
          return 1.5;
        // 50% increase during peak hours
        case "off-peak":
          return 0.8;
        // 20% discount during off-peak
        case "normal":
        default:
          return 1.0;
      }
    }

    /**
     * Calculate demand level based on order volume and rider count
     */
  }, {
    key: "calculateDemandLevel",
    value: function calculateDemandLevel(activeOrders, availableRiders) {
      if (availableRiders === 0) {
        return 1.0; // Maximum demand if no riders available
      }
      var ratio = activeOrders / availableRiders;

      // Normalize to 0-1 range
      // If ratio > 2 (2 orders per rider), demand is high
      if (ratio >= 2) {
        return 1.0;
      } else if (ratio >= 1) {
        return 0.5 + (ratio - 1) * 0.5; // 0.5 to 1.0
      } else {
        return ratio * 0.5; // 0 to 0.5
      }
    }

    /**
     * Get time of day category
     */
  }, {
    key: "getTimeOfDay",
    value: function getTimeOfDay() {
      var hour = new Date().getHours();

      // Peak hours: 7-9 AM, 12-2 PM, 6-9 PM
      if (hour >= 7 && hour < 9 || hour >= 12 && hour < 14 || hour >= 18 && hour < 21) {
        return "peak";
      }

      // Off-peak: 11 PM - 6 AM
      if (hour >= 23 || hour < 6) {
        return "off-peak";
      }
      return "normal";
    }
  }]);
}(); // Export singleton instance
var pricingService = exports.pricingService = new PricingService();