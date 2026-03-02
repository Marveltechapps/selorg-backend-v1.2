"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.routeOptimizationService = exports.RouteOptimizationService = void 0;
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * Route optimization service using nearest neighbor algorithm
 * For production, consider using more sophisticated algorithms (TSP solvers, OR-Tools)
 */
var RouteOptimizationService = exports.RouteOptimizationService = /*#__PURE__*/function () {
  function RouteOptimizationService() {
    _classCallCheck(this, RouteOptimizationService);
  }
  return _createClass(RouteOptimizationService, [{
    key: "optimizeRoute",
    value:
    /**
     * Optimize route for multiple stops
     */
    function optimizeRoute(startLocation, stops) {
      if (stops.length === 0) {
        return {
          stops: [],
          totalDistance: 0,
          totalTime: 0,
          route: []
        };
      }

      // Sort stops by priority first, then by distance
      var sortedStops = this.nearestNeighborOptimization(startLocation, stops);

      // Calculate total distance and time
      var totalDistance = 0;
      var totalTime = 0;
      var route = [startLocation];
      var currentLocation = startLocation;
      var _iterator = _createForOfIteratorHelper(sortedStops),
        _step;
      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var stop = _step.value;
          var distance = this.calculateDistance(currentLocation, stop.location);
          totalDistance += distance;
          totalTime += stop.estimatedTime + distance / 30 * 60; // Assuming 30 km/h average speed
          route.push(stop.location);
          currentLocation = stop.location;
        }
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }
      return {
        stops: sortedStops,
        totalDistance: totalDistance,
        totalTime: totalTime,
        route: route
      };
    }

    /**
     * Nearest neighbor algorithm for route optimization
     */
  }, {
    key: "nearestNeighborOptimization",
    value: function nearestNeighborOptimization(startLocation, stops) {
      var unvisited = _toConsumableArray(stops);
      var route = [];
      var currentLocation = startLocation;
      while (unvisited.length > 0) {
        // Find nearest unvisited stop
        var nearestIndex = 0;
        var nearestDistance = this.calculateDistance(currentLocation, unvisited[0].location);
        for (var i = 1; i < unvisited.length; i++) {
          var distance = this.calculateDistance(currentLocation, unvisited[i].location);
          // Consider priority: higher priority stops get distance reduction
          var adjustedDistance = distance / (1 + unvisited[i].priority * 0.1);
          if (adjustedDistance < nearestDistance) {
            nearestDistance = adjustedDistance;
            nearestIndex = i;
          }
        }
        var nearest = unvisited.splice(nearestIndex, 1)[0];
        route.push(nearest);
        currentLocation = nearest.location;
      }
      return route;
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
  }, {
    key: "calculateDistance",
    value: function calculateDistance(loc1, loc2) {
      var R = 6371; // Earth's radius in km
      var dLat = this.toRad(loc2.lat - loc1.lat);
      var dLon = this.toRad(loc2.lng - loc1.lng);
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.toRad(loc1.lat)) * Math.cos(this.toRad(loc2.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }
  }, {
    key: "toRad",
    value: function toRad(degrees) {
      return degrees * Math.PI / 180;
    }

    /**
     * Estimate delivery time based on distance and traffic
     */
  }, {
    key: "estimateDeliveryTime",
    value: function estimateDeliveryTime(distance) {
      var trafficMultiplier = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1.0;
      var averageSpeed = 30; // km/h
      var baseTime = distance / averageSpeed * 60; // minutes
      return Math.ceil(baseTime * trafficMultiplier);
    }
  }]);
}(); // Export singleton instance
var routeOptimizationService = exports.routeOptimizationService = new RouteOptimizationService();