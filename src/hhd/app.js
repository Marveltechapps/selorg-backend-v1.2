/**
 * HHD backend Express app. Mounted at /api by root server.js.
 * Routes are defined without /api prefix so that /api/auth, /api/orders etc. resolve correctly.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

const authRoutes = require('./api/routes/auth.routes');
const orderRoutes = require('./api/routes/order.routes');
const bagRoutes = require('./api/routes/bag.routes');
const itemRoutes = require('./api/routes/item.routes');
const rackRoutes = require('./api/routes/rack.routes');
const taskRoutes = require('./api/routes/task.routes');
const photoRoutes = require('./api/routes/photo.routes');
const userRoutes = require('./api/routes/user.routes');
const scannedItemRoutes = require('./api/routes/scannedItem.routes');
const pickRoutes = require('./api/routes/pick.routes');
const adminRoutes = require('./api/routes/admin.routes');
const dashboardRoutes = require('./api/routes/dashboard.routes');

const app = express();

app.use(helmet());
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.split(',')) || ['http://localhost:3000']
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

const rateLimitDisabled = process.env.RATE_LIMIT_ENABLED !== '1' && process.env.RATE_LIMIT_ENABLED !== 'true'; // Unlimited by default
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const rateLimitMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10);
const generalLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMaxRequests,
  message: { error: 'Too many requests', message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => rateLimitDisabled, // Unlimited by default
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

const uploadPath = process.env.UPLOAD_PATH || path.join(__dirname, '../../uploads');
app.use('/uploads', express.static(path.resolve(uploadPath)));

app.use(generalLimiter);

// Health endpoint for Applications management (no auth required)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'hhd',
    timestamp: new Date().toISOString(),
    uptime: process.uptime?.() ?? 0,
  });
});

const { cacheMiddleware } = require('../core/middleware');
const appConfig = require('../config/app');
app.use(cacheMiddleware(appConfig.cache.hhd.default));
app.use('/auth', authRoutes);
app.use('/orders', orderRoutes);
app.use('/bags', bagRoutes);
app.use('/items', itemRoutes);
app.use('/racks', rackRoutes);
app.use('/tasks', taskRoutes);
app.use('/photos', photoRoutes);
app.use('/users', userRoutes);
app.use('/scanned-items', scannedItemRoutes);
app.use('/pick', pickRoutes);
app.use('/admin', adminRoutes);
app.use('/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
