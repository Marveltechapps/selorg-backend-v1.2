"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.webSocketService = exports.WebSocketService = void 0;
var _websocketServer = require("./websocket.server.js");
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * WebSocket service for sending messages to connected riders
 */
var WebSocketService = exports.WebSocketService = /*#__PURE__*/function () {
  function WebSocketService() {
    _classCallCheck(this, WebSocketService);
  }
  return _createClass(WebSocketService, [{
    key: "notifyOrderAssignment",
    value:
    /**
     * Send order assignment notification to a specific rider
     */
    function notifyOrderAssignment(riderId, orderData) {
      var message = {
        type: "order_assignment_update",
        payload: orderData,
        timestamp: new Date().toISOString()
      };
      var sent = _websocketServer.webSocketServer.sendToRider(riderId, message);
      if (sent) {
        console.log("[WebSocket] Order assignment notification sent to rider ".concat(riderId));
      } else {
        console.warn("[WebSocket] Failed to send order assignment to rider ".concat(riderId, " (not connected)"));
      }
      return sent;
    }

    /**
     * Send order update notification to a specific rider
     */
  }, {
    key: "notifyOrderUpdate",
    value: function notifyOrderUpdate(riderId, orderData) {
      var message = {
        type: "order_update",
        payload: orderData,
        timestamp: new Date().toISOString()
      };
      var sent = _websocketServer.webSocketServer.sendToRider(riderId, message);
      if (sent) {
        console.log("[WebSocket] Order update notification sent to rider ".concat(riderId));
      } else {
        console.warn("[WebSocket] Failed to send order update to rider ".concat(riderId, " (not connected)"));
      }
      return sent;
    }

    /**
     * Broadcast message to all connected riders
     */
  }, {
    key: "broadcastToRiders",
    value: function broadcastToRiders(messageType, payload) {
      var message = {
        type: messageType,
        payload: payload,
        timestamp: new Date().toISOString()
      };
      var count = _websocketServer.webSocketServer.broadcastToRiders(message);
      console.log("[WebSocket] Broadcast ".concat(messageType, " to ").concat(count, " riders"));
      return count;
    }

    /**
     * Send location/status update to customers tracking this order
     */
  }, {
    key: "notifyOrderCustomers",
    value: function notifyOrderCustomers(orderId, message) {
      var sent = _websocketServer.webSocketServer.sendToOrderCustomers(orderId, message);
      if (sent > 0) {
        console.log("[WebSocket] Order update sent to ".concat(sent, " customer(s) for order ").concat(orderId));
      }
      return sent;
    }
  }, {
    key: "isRiderConnected",
    value: function isRiderConnected(riderId) {
      return _websocketServer.webSocketServer.isRiderConnected(riderId);
    }

    /**
     * Get total connection count
     */
  }, {
    key: "getConnectionCount",
    value: function getConnectionCount() {
      return _websocketServer.webSocketServer.getConnectionCount();
    }
  }]);
}(); // Export singleton instance
var webSocketService = exports.webSocketService = new WebSocketService();