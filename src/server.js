// Load env vars FIRST before any other requires
const path = require('path');
const dotenv = require('dotenv');

// Load .env from Backend root so it works when run from Backend/ or Backend/src/
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const xss = require('xss-clean');
const { createServer } = require('http');
const connectDB = require('./config/db');
const websocketService = require('./utils/websocket');
const {
  requestIdMiddleware,
  errorHandler,
  validateJWTSecret,
  authenticateToken,
  requireRole,
} = require('./core/middleware');
const { requestLoggerMiddleware } = require('./core/middleware/requestLogger.middleware');
const { apiLimiter } = require('./middleware/rateLimiter');
const validateEnvironment = require('./config/validateEnv');
const { createCorsOriginHandler } = require('./config/corsOrigins');
const logger = require('./core/utils/logger');

// Import dashboard routes
const productionRoutes = require('./production/routes');
const merchRoutes = require('./merch/routes');
const vendorRoutes = require('./vendor/routes');
const adminRoutes = require('./admin/routes');
const darkstoreRoutes = require('./darkstore/routes');
const financeRoutes = require('./finance/routes');
const warehouseRoutes = require('./warehouse/routes');
const sharedRoutes = require('./shared/routes');
const staffRoutes = require('./staff/routes/staffRoutes');
const riderAuthRoutes = require('./rider/routes/authRoutes');
const hhdApp = require('./hhd/app');
const pickerApp = require('./picker/app');
const customerApp = require('./customer-backend/app');

// Rider routing: prefer legacy when USE_LEGACY_RIDER=1 (dashboard needs /summary, /orders, /hr).
// Otherwise use v2 modules when present, fall back to legacy.
let riderRoutes;
if (process.env.USE_LEGACY_RIDER === '1' || process.env.USE_LEGACY_RIDER === 'true') {
  riderRoutes = require('./rider/routes');
  logger.info('Mounted legacy rider router for /api/v1/rider (USE_LEGACY_RIDER)');
} else {
  try {
    riderRoutes = require('./rider_v2_backend/src/modules/delivery/rider.router.js');
    logger.info('Mounted rider_v2 delivery router for /api/v1/rider');
  } catch (err) {
    riderRoutes = require('./rider/routes');
    logger.info('Mounted legacy rider router for /api/v1/rider (v2 not available)');
  }
}

// Also mount v2 routers for orders, payouts, incidents if available so their endpoints
// are handled by the v2 implementation while preserving existing paths.
function tryRequire(relPath) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(relPath);
    return mod;
  } catch (e) {
    logger.error('tryRequire failed', { path: relPath, error: e.message, stack: e.stack });
    return null;
  }
}
const v2OrderRouterModule = tryRequire('./rider_v2_backend/src/modules/orders/order.router.js');
const v2PayoutRouterModule = tryRequire('./rider_v2_backend/src/modules/payouts/payout.router.js');
const v2IncidentRouterModule = tryRequire('./rider_v2_backend/src/modules/incidents/incident.router.js');
const v2RiderRouterModule = tryRequire('./rider_v2_backend/src/modules/delivery/rider.router.js');
const v2OrderRouter = v2OrderRouterModule?.orderRouter || v2OrderRouterModule?.default || v2OrderRouterModule;
const v2PayoutRouter = v2PayoutRouterModule?.payoutRouter || v2PayoutRouterModule?.default || v2PayoutRouterModule;
const v2IncidentRouter = v2IncidentRouterModule?.incidentRouter || v2IncidentRouterModule?.default || v2IncidentRouterModule;
const v2RiderRouter = v2RiderRouterModule?.riderRouter || v2RiderRouterModule?.default || v2RiderRouterModule;
const v2OperationsRouterModule = tryRequire('./rider_v2_backend/src/modules/operations/operations.router.js');
const v2OperationsRouter = v2OperationsRouterModule?.operationsRouter || v2OperationsRouterModule?.default || v2OperationsRouterModule;
const v2ConfigRouterModule = tryRequire('./rider_v2_backend/src/modules/config/config.router.js');
const v2ConfigRouter = v2ConfigRouterModule?.configRouter || v2ConfigRouterModule?.default || v2ConfigRouterModule;
const v2ContentRouterModule = tryRequire('./rider_v2_backend/src/modules/content/content.router.js');
const v2ContentRouter = v2ContentRouterModule?.contentRouter || v2ContentRouterModule?.default || v2ContentRouterModule;
const v2KycRouterModule = tryRequire('./rider_v2_backend/src/modules/kyc/kyc.router.js');
const v2KycRouter = v2KycRouterModule?.kycRouter || v2KycRouterModule?.default || v2KycRouterModule;
let v2AuthRouter = null;
try {
  // Load explicitly so auth route failures are visible instead of being swallowed by tryRequire().
  const v2AuthModule = require('./rider_v2_backend/src/modules/auth/auth.router.js');
  v2AuthRouter = v2AuthModule?.authRouter ?? v2AuthModule;
} catch (err) {
  logger.warn('Unable to load rider v2 auth router', { error: err?.message });
}

let v2SigninRouter = null;
try {
  // Rider OTP flow depends on this router, so surface any load issue clearly.
  const v2SigninModule = require('./rider_v2_backend/src/modules/auth/signin.router.js');
  v2SigninRouter = v2SigninModule?.signinRouter ?? v2SigninModule;
} catch (err) {
  logger.warn('Unable to load rider v2 signin router', { error: err?.message });
}

// Validate critical environment variables on startup (skip in test mode)
if (process.env.NODE_ENV !== 'test') {
  try {
    validateEnvironment();
    validateJWTSecret();
  } catch (error) {
    logger.error('Startup validation failed', { error: error.message });
    process.exit(1);
  }

  // Connect to database
  connectDB();
  // Customer app startup (index creation); runs when DB is connected
  require('./customer-backend/startup').run();
}

const app = express();

app.use((req, res, next) => {
  console.log(`[GLOBAL LOG] ${req.method} ${req.path}`);
  next();
});

// Request ID middleware (must be first to track all requests)
app.use(requestIdMiddleware);

// Request logging middleware (after request ID is set)
app.use(requestLoggerMiddleware);

// Health check endpoints (before auth middleware - no auth required)
const { healthCheck, readinessCheck, databaseHealthCheck } = require('./core/controllers/health.controller');
app.get('/health', healthCheck);
app.get('/healthz', healthCheck); // Alias for rider/k8s compatibility
app.get('/health/ready', readinessCheck);
app.get('/health/db', databaseHealthCheck);

// Security middleware - Helmet (sets various HTTP headers)
// CSP disabled for API server - API responses are JSON, not HTML; mobile apps don't apply CSP
app.use(
  helmet({
    contentSecurityPolicy: false, // API returns JSON; CSP is for HTML documents
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false, // Allow API to be called from any origin (mobile, web)
  })
);

// Prevent NoSQL injection attacks
app.use(mongoSanitize());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Prevent XSS attacks
app.use(xss());

// Response compression
const compression = require('compression');
app.use(compression());

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const strictCors = cors({
  origin: createCorsOriginHandler((origin, allowedOrigins) => {
    logger.warn('CORS blocked origin', { origin, allowedOrigins });
  }),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
});

// Customer app: allow all origins (mobile apps often send no Origin or LAN IP)
const customerCors = cors({
  origin: true, // Reflect request origin or allow no-origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Site-Id'],
});

app.use((req, res, next) => {
  const isCustomerPath = req.path.startsWith('/api/v1/customer');
  if (isCustomerPath) return customerCors(req, res, next);
  return strictCors(req, res, next);
});

// General API rate limit (per IP) for all /api/v1 routes
app.use('/api/v1', apiLimiter);

// Mount dashboard routers under /api/v1/<dashboard-name>
app.use('/api/v1/darkstore', darkstoreRoutes);
app.use('/api/v1/production', productionRoutes);
app.use('/api/v1/merch', merchRoutes);

// Rider & related endpoints: prefer v2 routers when present (mounted first to take precedence)
if (v2OrderRouter) {
  app.use('/api/v1/orders', v2OrderRouter);
  logger.info('Mounted rider_v2 orders router at /api/v1/orders');
}
if (v2PayoutRouter) {
  app.use('/api/v1/payouts', v2PayoutRouter);
  logger.info('Mounted rider_v2 payouts router at /api/v1/payouts');
}
if (v2IncidentRouter) {
  app.use('/api/v1/incidents', v2IncidentRouter);
  logger.info('Mounted rider_v2 incidents router at /api/v1/incidents');
}
if (v2OperationsRouter) {
  app.use('/api/v1/operations', v2OperationsRouter);
  logger.info('Mounted rider_v2 operations router at /api/v1/operations');
}
if (v2ConfigRouter) {
  app.use('/api/v1/config', v2ConfigRouter);
  logger.info('Mounted rider_v2 config router at /api/v1/config');
}
if (v2ContentRouter) {
  app.use('/api/v1/content', v2ContentRouter);
  logger.info('Mounted rider_v2 content router at /api/v1/content');
}
if (v2KycRouter) {
  app.use('/api/v1/kyc', v2KycRouter);
  logger.info('Mounted rider_v2 kyc router at /api/v1/kyc');
}
if (v2AuthRouter) {
  app.use('/api/v1/auth', v2AuthRouter);
  logger.info('Mounted rider_v2 auth router at /api/v1/auth');
} else {
  logger.warn('Rider v2 auth router unavailable; /api/v1/auth routes not mounted');
}

// Rider signin OTP (send-otp, verify-otp, resend-otp) — used by Rider mobile app
const signinRouter = v2SigninRouter;
if (signinRouter) {
  app.use('/api/signin', signinRouter);
  logger.info('Mounted rider_v2 signin router at /api/signin');
} else {
  logger.warn('Rider v2 signin router unavailable; /api/signin routes not mounted');
}

// Rider dashboard auth is email/password based and lives in the legacy rider module.
// Keep it mounted even when the rider operational APIs come from the v2 stack.
app.use('/api/v1/rider/auth', riderAuthRoutes);

// Explicitly mount kit and hr routes for dashboard and rider app access.
// These legacy routes are needed when USE_LEGACY_RIDER is not set, as v2 modules
// may not yet implement all administrative or onboarding features.
const riderHrRoutes = require('./rider/routes/hrRoutes');
const riderKitRoutes = require('./rider/routes/kitRoutes');
app.use('/api/v1/rider/hr', riderHrRoutes);
app.use('/api/v1/rider/kit', riderKitRoutes);

// CRITICAL: Mount legacy rider orders (list, assign, alert) BEFORE main rider router.
// This ensures /api/v1/rider/orders/:orderId/assign always uses warehouse orderService
// with RiderOperational (string id), not ProductionRider/DarkstoreRider (ObjectId _id).
const riderOrderRoutes = require('./rider/routes/orderRoutes');
app.use('/api/v1/rider/orders', riderOrderRoutes);

// Rider shift master CRUD + flows (available/list, my, select, start, end).
// Must be mounted before the main /api/v1/rider router: when USE_LEGACY_RIDER is off,
// riderMain is the v2 delivery router, which does not expose /shifts.
const riderShiftRoutes = require('./rider/routes/shiftRoutes');
app.use('/api/v1/rider/shifts', riderShiftRoutes);

const riderDashboardNotificationRoutes = require('./rider/routes/dashboardNotificationRoutes');
app.use(
  '/api/v1/rider/notifications',
  authenticateToken,
  requireRole('rider', 'admin', 'super_admin'),
  riderDashboardNotificationRoutes
);

// Rider wrapper: health route + main router (v2 exports riderRouter, legacy exports router)
const riderMain = riderRoutes.riderRouter || riderRoutes;
const riderWithHealth = express.Router();
riderWithHealth.get('/health', (_req, res) =>
  res.status(200).json({ ok: true, service: 'rider', timestamp: new Date().toISOString() })
);
riderWithHealth.use('/', riderMain);
app.use('/api/v1/rider', riderWithHealth);

// Delivery wrapper: prefers V2 delivery router for mobile apps
const deliveryRouter = v2RiderRouter || riderMain;
const deliveryWithHealth = express.Router();
deliveryWithHealth.get('/health', (_req, res) =>
  res.status(200).json({ ok: true, service: 'delivery', timestamp: new Date().toISOString() })
);
deliveryWithHealth.use('/', deliveryRouter);
app.use('/api/v1/delivery', deliveryWithHealth);

app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/vendor', vendorRoutes);
app.use('/api/v1/warehouse', warehouseRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/support', require('./support/routes/supportRoutes'));
app.use('/api/v1/shared', sharedRoutes);
app.use('/api/v1/staff', staffRoutes);

// HHD, Picker, and Customer APIs – unified backend (versioned)
app.use('/api/v1/hhd', hhdApp);
app.use('/api/v1/picker', pickerApp);
app.use('/api/v1/customer', customerApp); // Customer app: onboarding, auth, home, products, user

// API Documentation (Swagger)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./config/swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Selorg API Documentation',
  }));
  logger.info('Swagger documentation available at /api-docs');
}

// Metrics endpoint (Prometheus)
if (process.env.ENABLE_METRICS === 'true') {
  const metrics = require('./utils/metrics');
  app.get('/metrics', async (req, res) => {
    try {
      const metricsData = await metrics.getMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metricsData);
    } catch (err) {
      res.status(500).send('# Metrics not available');
    }
  });
  logger.info('Prometheus metrics available at /metrics');
}

// Global error handler middleware (must be last)
app.use(errorHandler);

// Export app for testing (after all routes are configured)
module.exports = app;

// Default 5001: macOS AirPlay uses port 5000 and returns 403 for API requests
const PORT = process.env.PORT || 5001;

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket publisher (Redis Pub/Sub)
if (process.env.NODE_ENV !== 'test') {
  websocketService.initialize(httpServer);
  // Clear any pre-existing upgrade listeners to prevent "handleUpgrade called more than once"
  // (conflict when multiple WebSocket handlers attach to the same HTTP server)
  httpServer.removeAllListeners('upgrade');
  // Initialize Socket.IO for real-time (HHD, Picker, Dashboard clients)
  try {
    const { initSocketIO } = require('./hhd/config/socket');
    initSocketIO(httpServer);
    logger.info('Socket.IO initialized at path /hhd-socket.io');
  } catch (socketErr) {
    logger.warn('Socket.IO init skipped', { error: socketErr?.message });
  }
  // Rider app WebSocket at /ws for real-time order assignment updates
  try {
    const { webSocketServer } = require('./rider_v2_backend/src/modules/websocket/websocket.server.js');
    webSocketServer.initialize(httpServer);
    logger.info('Rider WebSocket initialized at /ws');
  } catch (wsErr) {
    logger.warn('Rider WebSocket init skipped', { error: wsErr?.message });
  }
}

// Start server (only if not in test mode)
// Bind to 0.0.0.0 so mobile devices on LAN (e.g. 192.168.x.x) can reach the API
if (process.env.NODE_ENV !== 'test') {
  const HOST = process.env.HOST || '0.0.0.0';
  httpServer.listen(PORT, HOST, () => {
    logger.info('Server started', {
      host: HOST,
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development',
      version: process.env.API_VERSION || '1.0.0',
    });
    logger.info('WebSocket server initialized');

    // Start operational alerts job (ORDER_SLA_BREACHED, PICKER_INACTIVE)
    try {
      const operationalAlertsJob = require('./darkstore/jobs/operationalAlertsJob');
      operationalAlertsJob.start(90 * 1000); // every 90 seconds
      logger.info('Operational alerts job started (interval: 90s)');
    } catch (jobErr) {
      logger.warn('Operational alerts job failed to start', { error: jobErr?.message });
    }

    // Start coupon status management job (SCHEDULED -> ACTIVE, ACTIVE -> EXPIRED)
    try {
      const couponStatusJob = require('./customer-backend/jobs/couponStatusJob');
      couponStatusJob.start(60 * 1000); // every 60 seconds
      logger.info('Coupon status management job started (interval: 60s)');
    } catch (couponJobErr) {
      logger.warn('Coupon status management job failed to start', { error: couponJobErr?.message });
    }

    // Start Worldline payment reconciliation job (stale pending -> unknown)
    try {
      const worldlineReconciliationJob = require('./customer-backend/jobs/worldlineReconciliationJob');
      worldlineReconciliationJob.start(5 * 60 * 1000); // every 5 minutes
      logger.info('Worldline reconciliation job started (interval: 5m)');
    } catch (wlJobErr) {
      logger.warn('Worldline reconciliation job failed to start', { error: wlJobErr?.message });
    }
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error('Port already in use', {
        port: PORT,
        error: err.message,
        suggestion: `Port ${PORT} is already in use. Please either:
          1. Stop the process using port ${PORT}
          2. Set a different PORT in your .env file (e.g., PORT=5001)
          3. Kill the process: lsof -ti:${PORT} | xargs kill -9`,
      });
      process.exit(1);
    } else {
      logger.error('Server startup error', {
        error: err.message,
        stack: err.stack,
      });
      process.exit(1);
    }
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Promise Rejection', {
    error: err.message,
    stack: err.stack,
  });
  // In dev mode, we keep the server running to allow the user to fix issues
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  // Special handling for port conflicts
  if (err.code === 'EADDRINUSE') {
    logger.error('Port conflict detected', {
      error: err.message,
      port: PORT,
      suggestion: `Port ${PORT} is already in use. Please either:
        1. Stop the process using port ${PORT}: lsof -ti:${PORT} | xargs kill -9
        2. Set a different PORT in your .env file (e.g., PORT=5001)
        3. Wait for the port to become available`,
    });
  } else {
    logger.error('Uncaught Exception', {
      error: err.message,
      stack: err.stack,
    });
  }
  // Exit process for uncaught exceptions (server is in undefined state)
  process.exit(1);
});

