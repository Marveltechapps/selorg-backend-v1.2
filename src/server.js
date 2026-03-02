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
const { requestIdMiddleware, errorHandler, validateJWTSecret } = require('./core/middleware');
const { requestLoggerMiddleware } = require('./core/middleware/requestLogger.middleware');
const { apiLimiter } = require('./middleware/rateLimiter');
const validateEnvironment = require('./config/validateEnv');
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
    return require(relPath);
  } catch (e) {
    return null;
  }
}
const v2OrderRouter = tryRequire('./rider_v2_backend/src/modules/orders/order.router.js');
const v2PayoutRouter = tryRequire('./rider_v2_backend/src/modules/payouts/payout.router.js');
const v2IncidentRouter = tryRequire('./rider_v2_backend/src/modules/incidents/incident.router.js');
const v2AuthRouter = tryRequire('./rider_v2_backend/src/modules/auth/auth.router.js');
const v2SigninRouter = tryRequire('./rider_v2_backend/src/modules/auth/signin.router.js');

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
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for API
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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

// CORS configuration - allow mobile apps (Expo, React Native) and dashboard
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8081',
      'http://localhost:19006',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8081',
      'http://127.0.0.1:19006',
    ];

// Allow any localhost/127.0.0.1/0.0.0.0 origin (any port) so Expo/Metro/customer app always work
const isLocalOrigin = (o) =>
  typeof o === 'string' &&
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(o.trim());

// Expo / React Native can send exp:// or http(s) with LAN IP; allow so customer app never gets 403
const isExpoOrMobileOrigin = (o) =>
  typeof o === 'string' &&
  (o.trim().startsWith('exp://') ||
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(o.trim()));

const strictCors = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin || origin === 'null' || origin === '') return callback(null, true);
    // Allow any localhost/127.0.0.1/0.0.0.0 with any port (Expo web, Metro, customer app)
    if (isLocalOrigin(origin)) return callback(null, true);
    // Allow Expo (exp://) and common mobile dev origins (LAN IP + 172.16-31) so customer app works even if NODE_ENV=production
    if (isExpoOrMobileOrigin(origin)) return callback(null, true);
    // In non-production (including NODE_ENV unset), allow any origin
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    logger.warn('CORS blocked origin', { origin, allowedOrigins });
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
});

const customerCors = cors({ origin: true, credentials: true });

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
if (v2AuthRouter) {
  app.use('/api/v1/auth', v2AuthRouter);
  logger.info('Mounted rider_v2 auth router at /api/v1/auth');
}

// Rider signin OTP (send-otp, verify-otp, resend-otp) — used by Rider mobile app
const signinRouter = v2SigninRouter?.signinRouter ?? v2SigninRouter;
if (signinRouter) {
  app.use('/api/signin', signinRouter);
  logger.info('Mounted rider_v2 signin router at /api/signin');
}

// Rider wrapper: health route + main router (v2 exports riderRouter, legacy exports router)
const riderMain = riderRoutes.riderRouter || riderRoutes;
const riderWithHealth = express.Router();
riderWithHealth.get('/health', (_req, res) =>
  res.status(200).json({ ok: true, service: 'rider', timestamp: new Date().toISOString() })
);
riderWithHealth.use('/', riderMain);
app.use('/api/v1/rider', riderWithHealth);
app.use('/api/v1/delivery', riderWithHealth);

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

const PORT = process.env.PORT || 5000;

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket (skip in test mode)
if (process.env.NODE_ENV !== 'test') {
  websocketService.initialize(httpServer);
  // HHD Socket.IO for real-time order updates
  const { initSocketIO } = require('./hhd/config/socket');
  initSocketIO(httpServer);
}

// Start server (only if not in test mode)
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    logger.info('Server started', {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development',
      version: process.env.API_VERSION || '1.0.0',
    });
    logger.info('WebSocket server initialized');
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

