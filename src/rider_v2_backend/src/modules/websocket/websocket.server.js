"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.webSocketServer = void 0;
var _ws = require("ws");
var _nodeUrl = require("node:url");
var _redis = require("../../config/redis.js");
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var WebSocketServerManager = /*#__PURE__*/function () {
  // Queue for offline riders

  function WebSocketServerManager() {
    _classCallCheck(this, WebSocketServerManager);
    _defineProperty(this, "wss", null);
    _defineProperty(this, "connections", new Map());
    _defineProperty(this, "pingInterval", null);
    _defineProperty(this, "redisSubscriber", null);
    _defineProperty(this, "redisPublisher", null);
    _defineProperty(this, "serverId", void 0);
    _defineProperty(this, "messageQueue", new Map());
    _defineProperty(this, "orderSubscriptions", new Map());
    // Generate unique server ID for this instance
    this.serverId = "server_".concat(Date.now(), "_").concat(Math.random().toString(36).substring(7));
  }
  return _createClass(WebSocketServerManager, [{
    key: "initialize",
    value: function initialize(server) {
      var _this = this;
      this.wss = new _ws.WebSocketServer({
        noServer: true,
        perMessageDeflate: false
      });

      // Handle HTTP upgrade requests
      server.on("upgrade", function (request, socket, head) {
        var pathname = new _nodeUrl.URL(request.url || "", "http://".concat(request.headers.host)).pathname;

        // Only handle /ws endpoint
        if (pathname === "/ws") {
          _this.handleUpgrade(request, socket, head);
        } else {
          socket.destroy();
        }
      });

      // Setup ping interval to keep connections alive
      this.pingInterval = setInterval(function () {
        _this.pingConnections();
      }, 30000); // Ping every 30 seconds

      // Initialize Redis pub/sub for multi-server support
      this.initializeRedisPubSub();
      console.log("\u2705 WebSocket server initialized (ID: ".concat(this.serverId, ")"));
    }
  }, {
    key: "initializeRedisPubSub",
    value: function initializeRedisPubSub() {
      var _this2 = this;
      try {
        var redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
          console.warn("[WebSocket] Redis URL not configured, running in single-server mode");
          return;
        }

        // Create separate connections for pub/sub
        this.redisSubscriber = (0, _redis.getRedisClient)();
        this.redisPublisher = (0, _redis.getRedisClient)();

        // Subscribe to WebSocket message channel
        this.redisSubscriber.subscribe("websocket:messages", function (err) {
          if (err) {
            console.error("[WebSocket] Redis subscription error:", err);
          } else {
            console.log("[WebSocket] Redis pub/sub initialized");
          }
        });

        // Handle incoming messages from other servers
        this.redisSubscriber.on("message", function (channel, message) {
          if (channel === "websocket:messages") {
            try {
              var data = JSON.parse(message);
              // Only process messages not from this server
              if (data.serverId !== _this2.serverId) {
                _this2.handleRedisMessage(data);
              }
            } catch (error) {
              console.error("[WebSocket] Error processing Redis message:", error);
            }
          }
        });
      } catch (error) {
        console.error("[WebSocket] Failed to initialize Redis pub/sub:", error);
      }
    }
  }, {
    key: "handleRedisMessage",
    value: function handleRedisMessage(data) {
      if (data.type === "send_to_rider" && data.riderId) {
        // Try to send message to rider if connected to this server
        this.sendToRider(data.riderId, data.message);
      } else if (data.type === "broadcast") {
        // Broadcast to all riders on this server
        this.broadcastToRiders(data.message);
      }
    }
  }, {
    key: "handleUpgrade",
    value: function handleUpgrade(request, socket, head) {
      var _this3 = this;
      try {
        var _this$wss;
        var url = new _nodeUrl.URL(request.url || "", "http://".concat(request.headers.host));
        var userId = url.searchParams.get("userId");
        var userType = url.searchParams.get("userType");

        // Validate query parameters
        if (!userId || !userType) {
          console.warn("[WebSocket] Rejected connection: missing userId or userType");
          socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
          socket.destroy();
          return;
        }

        // Allow rider and customer connections
        if (userType !== "rider" && userType !== "customer") {
          console.warn("[WebSocket] Rejected connection: invalid userType ".concat(userType));
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        // Upgrade to WebSocket
        (_this$wss = this.wss) === null || _this$wss === void 0 || _this$wss.handleUpgrade(request, socket, head, function (ws) {
          _this3.handleConnection(ws, userId, userType);
        });
      } catch (error) {
        console.error("[WebSocket] Upgrade error:", error);
        socket.destroy();
      }
    }
  }, {
    key: "handleConnection",
    value: function handleConnection(ws, riderId, userType) {
      var _this4 = this;
      var connectionId = "".concat(userType, "_").concat(riderId);

      // Close existing connection if rider reconnects
      var existingConnection = this.connections.get(connectionId);
      if (existingConnection) {
        console.log("[WebSocket] Closing existing connection for ".concat(connectionId));
        existingConnection.ws.close(1000, "New connection established");
        this.connections["delete"](connectionId);
      }
      var connection = {
        ws: ws,
        riderId: riderId,
        userType: userType,
        userId: riderId,
        connectedAt: new Date(),
        lastPing: new Date(),
        subscribedOrders: userType === "customer" ? new Set() : undefined
      };
      this.connections.set(connectionId, connection);
      console.log("[WebSocket] ".concat(userType, " ").concat(riderId, " connected (").concat(this.connections.size, " total connections)"));

      // Handle messages
      ws.on("message", function (data) {
        try {
          var message = JSON.parse(data.toString());
          _this4.handleMessage(connection, message);
        } catch (error) {
          console.error("[WebSocket] Error parsing message from ".concat(riderId, ":"), error);
        }
      });

      // Handle close
      ws.on("close", function (code, reason) {
        if (userType === "customer" && connection.subscribedOrders) {
          connection.subscribedOrders.forEach(function (oid) {
            var subs = _this4.orderSubscriptions.get(oid);
            if (subs) {
              subs["delete"](connectionId);
              if (subs.size === 0) _this4.orderSubscriptions["delete"](oid);
            }
          });
        }
        console.log("[WebSocket] ".concat(userType, " ").concat(riderId, " disconnected"));
        _this4.connections["delete"](connectionId);
      });

      // Handle errors
      ws.on("error", function (error) {
        console.error("[WebSocket] Error for rider ".concat(riderId, ":"), error);
        _this4.connections["delete"](connectionId);
      });

      // Send welcome message
      this.sendToConnection(connection, {
        type: "connected",
        payload: {
          message: "WebSocket connection established"
        },
        timestamp: new Date().toISOString()
      });

      // Process any queued messages for this rider
      this.processQueuedMessages(riderId);
    }
  }, {
    key: "processQueuedMessages",
    value: function processQueuedMessages(riderId) {
      var _this5 = this;
      var queuedMessages = this.messageQueue.get(riderId);
      if (queuedMessages && queuedMessages.length > 0) {
        console.log("[WebSocket] Processing ".concat(queuedMessages.length, " queued messages for rider ").concat(riderId));
        var connection = this.connections.get("rider_".concat(riderId));
        if (connection) {
          queuedMessages.forEach(function (message) {
            _this5.sendToConnection(connection, message);
          });
          this.messageQueue["delete"](riderId);
        }
      }
    }
  }, {
    key: "handleMessage",
    value: function handleMessage(connection, message) {
      if (message.type === "ping") {
        connection.lastPing = new Date();
        this.sendToConnection(connection, {
          type: "pong",
          payload: {},
          timestamp: new Date().toISOString()
        });
        return;
      }
      if (connection.userType === "customer" && message.type === "subscribe" && message.orderId) {
        var orderId = String(message.orderId);
        var connId = "customer_".concat(connection.riderId);
        if (!connection.subscribedOrders) connection.subscribedOrders = new Set();
        connection.subscribedOrders.add(orderId);
        if (!this.orderSubscriptions.has(orderId)) this.orderSubscriptions.set(orderId, new Set());
        this.orderSubscriptions.get(orderId).add(connId);
        return;
      }
      if (connection.userType === "customer" && message.type === "unsubscribe" && message.orderId) {
        var oid = String(message.orderId);
        var cid = "customer_".concat(connection.riderId);
        if (connection.subscribedOrders) connection.subscribedOrders["delete"](oid);
        var s = this.orderSubscriptions.get(oid);
        if (s) {
          s["delete"](cid);
          if (s.size === 0) this.orderSubscriptions["delete"](oid);
        }
        return;
      }
      console.log("[WebSocket] Received message from ".concat(connection.userId || connection.riderId, ":"), message.type);
    }
  }, {
    key: "sendToOrderCustomers",
    value: function sendToOrderCustomers(orderId, message) {
      var _this7 = this;
      var subs = this.orderSubscriptions.get(String(orderId));
      if (!subs || subs.size === 0) return 0;
      var sent = 0;
      subs.forEach(function (connId) {
        var conn = _this7.connections.get(connId);
        if (conn && conn.ws.readyState === _ws.WebSocket.OPEN) {
          _this7.sendToConnection(conn, message);
          sent++;
        }
      });
      return sent;
    }
  }, {
    key: "pingConnections",
    value: function pingConnections() {
      var _this6 = this;
      var now = new Date();
      var connectionsToClose = [];
      this.connections.forEach(function (connection, connectionId) {
        // Check if connection is still alive
        if (connection.ws.readyState === _ws.WebSocket.OPEN) {
          try {
            connection.ws.ping();
            connection.lastPing = now;
          } catch (error) {
            console.error("[WebSocket] Ping error for ".concat(connectionId, ":"), error);
            connectionsToClose.push(connectionId);
          }
        } else {
          connectionsToClose.push(connectionId);
        }
      });

      // Clean up dead connections
      connectionsToClose.forEach(function (connectionId) {
        var connection = _this6.connections.get(connectionId);
        if (connection) {
          connection.ws.close(1000, "Connection timeout");
          _this6.connections["delete"](connectionId);
        }
      });
    }
  }, {
    key: "sendToConnection",
    value: function sendToConnection(connection, message) {
      if (connection.ws.readyState === _ws.WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error("[WebSocket] Error sending message to ".concat(connection.riderId, ":"), error);
        }
      }
    }

    // Public method to send message to specific rider
  }, {
    key: "sendToRider",
    value: function sendToRider(riderId, message) {
      var connectionId = "rider_".concat(riderId);
      var connection = this.connections.get(connectionId);
      if (connection) {
        this.sendToConnection(connection, message);
        return true;
      }

      // If rider not connected, queue the message
      if (!this.messageQueue.has(riderId)) {
        this.messageQueue.set(riderId, []);
      }
      this.messageQueue.get(riderId).push(message);

      // Publish to Redis for other servers to try
      if (this.redisPublisher) {
        try {
          this.redisPublisher.publish("websocket:messages", JSON.stringify({
            serverId: this.serverId,
            type: "send_to_rider",
            riderId: riderId,
            message: message
          }));
        } catch (error) {
          console.error("[WebSocket] Error publishing to Redis:", error);
        }
      }
      console.warn("[WebSocket] No connection found for rider ".concat(riderId, ", message queued"));
      return false;
    }

    // Public method to broadcast to all riders
  }, {
    key: "broadcastToRiders",
    value: function broadcastToRiders(message) {
      var _this7 = this;
      var sentCount = 0;
      this.connections.forEach(function (connection) {
        if (connection.userType === "rider") {
          _this7.sendToConnection(connection, message);
          sentCount++;
        }
      });

      // Publish to Redis for other servers
      if (this.redisPublisher) {
        try {
          this.redisPublisher.publish("websocket:messages", JSON.stringify({
            serverId: this.serverId,
            type: "broadcast",
            message: message
          }));
        } catch (error) {
          console.error("[WebSocket] Error publishing broadcast to Redis:", error);
        }
      }
      return sentCount;
    }

    // Get connection count
  }, {
    key: "getConnectionCount",
    value: function getConnectionCount() {
      return this.connections.size;
    }

    // Get rider connection status
  }, {
    key: "isRiderConnected",
    value: function isRiderConnected(riderId) {
      return this.connections.has("rider_".concat(riderId));
    }

    // Cleanup
  }, {
    key: "shutdown",
    value: function shutdown() {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }

      // Close Redis connections
      if (this.redisSubscriber) {
        this.redisSubscriber.quit()["catch"](console.error);
        this.redisSubscriber = null;
      }
      if (this.redisPublisher) {
        this.redisPublisher.quit()["catch"](console.error);
        this.redisPublisher = null;
      }

      // Close all connections
      this.connections.forEach(function (connection) {
        connection.ws.close(1000, "Server shutting down");
      });
      this.connections.clear();

      // Clear message queue
      this.messageQueue.clear();

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }
      console.log("✅ WebSocket server shut down");
    }
  }]);
}(); // Export singleton instance
var webSocketServer = exports.webSocketServer = new WebSocketServerManager();