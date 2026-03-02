"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createApp = void 0;
var _cors = _interopRequireDefault(require("cors"));
var _express = _interopRequireDefault(require("express"));
var _helmet = _interopRequireDefault(require("helmet"));
var _morgan = _interopRequireDefault(require("morgan"));
var _hpp = _interopRequireDefault(require("hpp"));
var _notFound = require("./middleware/not-found.js");
var _errorHandler = require("./middleware/error-handler.js");
var _rateLimiter = require("./middleware/rateLimiter.js");
var _validation = require("./middleware/validation.js");
var _requestLogger = require("./middleware/request-logger.js");
var _authenticate = require("./middleware/authenticate.js");
var _websocketServer = require("./modules/websocket/websocket.server.js");
var _authRouter = require("./modules/auth/auth.router.js");
var _signinRouter = require("./modules/auth/signin.router.js");
var _riderRouter = require("./modules/delivery/rider.router.js");
var _orderRouter = require("./modules/orders/order.router.js");
var orderService = _interopRequireWildcard(require("./modules/orders/order.service.js"));
var _payoutRouter = require("./modules/payouts/payout.router.js");
var _incidentRouter = require("./modules/incidents/incident.router.js");
var _operationsRouter = require("./modules/operations/operations.router.js");
var _kycRouter = require("./modules/kyc/kyc.router.js");
var _contentRouter = require("./modules/content/content.router.js");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t2 in e) "default" !== _t2 && {}.hasOwnProperty.call(e, _t2) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t2)) && (i.get || i.set) ? o(f, _t2, i) : f[_t2] = e[_t2]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var createApp = exports.createApp = function createApp() {
  var app = (0, _express["default"])();

  // Enhanced security headers with Helmet
  app.use((0, _helmet["default"])({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    frameguard: {
      action: "deny"
    },
    noSniff: true,
    xssFilter: true
  }));

  // CORS configuration with whitelist-based origins
  var allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(function (origin) {
    return origin.trim();
  }) : ["http://localhost:3000", "http://localhost:19006", "exp://localhost:19000"];
  app.use((0, _cors["default"])({
    origin: function origin(_origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!_origin) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(_origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200
  }));

  // Body parsing with size limits
  app.use(_express["default"].json({
    limit: "10mb"
  }));
  app.use(_express["default"].urlencoded({
    extended: true,
    limit: "10mb"
  }));

  // Security middleware
  app.use(_validation.sanitizeMongo); // Prevent MongoDB operator injection
  app.use((0, _hpp["default"])()); // Prevent HTTP Parameter Pollution
  app.use(_validation.preventHPP); // Additional HPP protection

  // Request logging (before morgan for request ID)
  app.use(_requestLogger.requestLogger);

  // Logging
  app.use((0, _morgan["default"])("dev"));

  // Rate limiting (applied to all routes)
  app.use(_rateLimiter.apiLimiter);

  // Health check endpoint (excluded from rate limiting)
  app.get("/healthz", function (_req, res) {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  // WebSocket health check endpoint
  app.get("/api/websocket/health", _authenticate.authenticate, /*#__PURE__*/function () {
    var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(_req, res) {
      var connections;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            try {
              connections = _websocketServer.webSocketServer.getConnectionCount();
              res.json({
                status: "ok",
                websocket: {
                  connections: connections,
                  status: connections > 0 ? "active" : "inactive",
                  endpoint: "/ws"
                },
                timestamp: new Date().toISOString()
              });
            } catch (error) {
              console.error("[WebSocket Health] Error:", error);
              res.status(500).json({
                error: "Failed to check WebSocket health",
                code: "INTERNAL_ERROR"
              });
            }
          case 1:
            return _context.a(2);
        }
      }, _callee);
    }));
    return function (_x, _x2) {
      return _ref.apply(this, arguments);
    };
  }());

  // Diagnostics endpoint
  app.get("/api/diagnostics", _authenticate.authenticate, /*#__PURE__*/function () {
    var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(_req, res) {
      var _app$_router, routes, wsConnections, env;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            try {
              // Get all registered routes
              routes = [];
              (_app$_router = app._router) === null || _app$_router === void 0 || _app$_router.stack.forEach(function (middleware) {
                if (middleware.route) {
                  var methods = Object.keys(middleware.route.methods).map(function (m) {
                    return m.toUpperCase();
                  });
                  methods.forEach(function (method) {
                    routes.push({
                      method: method,
                      path: middleware.route.path
                    });
                  });
                } else if (middleware.name === "router") {
                  // Handle sub-routers
                  middleware.handle.stack.forEach(function (handler) {
                    if (handler.route) {
                      var _methods = Object.keys(handler.route.methods).map(function (m) {
                        return m.toUpperCase();
                      });
                      _methods.forEach(function (method) {
                        routes.push({
                          method: method,
                          path: handler.route.path
                        });
                      });
                    }
                  });
                }
              });

              // Get WebSocket connection status
              wsConnections = _websocketServer.webSocketServer.getConnectionCount(); // Get environment info (sanitized)
              env = {
                NODE_ENV: process.env.NODE_ENV,
                PORT: process.env.PORT
                // Don't expose sensitive info
              };
              res.json({
                status: "ok",
                timestamp: new Date().toISOString(),
                server: {
                  uptime: process.uptime(),
                  memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                  }
                },
                websocket: {
                  connections: wsConnections,
                  status: wsConnections > 0 ? "active" : "inactive"
                },
                routes: {
                  count: routes.length,
                  list: routes
                },
                environment: env
              });
            } catch (error) {
              console.error("[Diagnostics] Error:", error);
              res.status(500).json({
                error: "Failed to generate diagnostics",
                code: "INTERNAL_ERROR"
              });
            }
          case 1:
            return _context2.a(2);
        }
      }, _callee2);
    }));
    return function (_x3, _x4) {
      return _ref2.apply(this, arguments);
    };
  }());

  // Fix for /api/admin/orders route mismatch
  // Frontend calls /api/admin/orders but orderRouter is mounted at /api/orders
  // This creates a dedicated route at /api/admin/orders
  app.get("/api/admin/orders", _authenticate.authenticate, /*#__PURE__*/function () {
    var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(req, res) {
      var filters, limit, orders, _t;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.p = _context3.n) {
          case 0:
            if (req.user) {
              _context3.n = 1;
              break;
            }
            res.status(401).json({
              error: "Unauthorized",
              code: "AUTH_FAILED"
            });
            return _context3.a(2);
          case 1:
            _context3.p = 1;
            filters = {
              riderId: req.user.id // Only get orders for this rider
            };
            if (req.query.status) {
              filters.status = req.query.status;
            }
            if (req.query.warehouseCode) {
              filters.warehouseCode = req.query.warehouseCode;
            }
            limit = req.query.limit ? parseInt(req.query.limit) : 50;
            _context3.n = 2;
            return orderService.listOrders(_objectSpread(_objectSpread({}, filters), {}, {
              limit: limit
            }));
          case 2:
            orders = _context3.v;
            res.json({
              orders: orders,
              count: orders.length
            });
            _context3.n = 4;
            break;
          case 3:
            _context3.p = 3;
            _t = _context3.v;
            console.error("[API] Error fetching orders:", _t);
            res.status(500).json({
              error: "Failed to fetch orders",
              code: "INTERNAL_ERROR"
            });
          case 4:
            return _context3.a(2);
        }
      }, _callee3, null, [[1, 3]]);
    }));
    return function (_x5, _x6) {
      return _ref3.apply(this, arguments);
    };
  }());

  // API versioning - v1 routes
  app.use("/api/signin", _signinRouter.signinRouter);
  app.use("/api/v1/auth", _authRouter.authRouter);
  app.use("/api/v1/delivery", _riderRouter.riderRouter);
  app.use("/api/v1/orders", _orderRouter.orderRouter);
  app.use("/api/v1/payouts", _payoutRouter.payoutRouter);
  app.use("/api/v1/incidents", _incidentRouter.incidentRouter);
  app.use("/api/v1/operations", _operationsRouter.operationsRouter);
  app.use("/api/v1/kyc", _kycRouter.kycRouter);
  app.use("/api/v1/content", _contentRouter.contentRouter);

  // Legacy routes (backward compatibility) - redirect to v1
  app.use("/api/auth", _authRouter.authRouter);
  app.use("/api/delivery", _riderRouter.riderRouter);
  app.use("/api/orders", _orderRouter.orderRouter);
  app.use("/api/payouts", _payoutRouter.payoutRouter);
  app.use("/api/incidents", _incidentRouter.incidentRouter);
  app.use("/api/operations", _operationsRouter.operationsRouter);
  app.use("/api/kyc", _kycRouter.kycRouter);
  app.use("/api/content", _contentRouter.contentRouter);
  app.use(_notFound.notFoundHandler);
  app.use(_errorHandler.errorHandler);
  return app;
};