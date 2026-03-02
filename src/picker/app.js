const express = require('express');
const cors = require('cors');
const { isDbConnected } = require('./config/db');
const { errorHandler } = require('./middlewares/error.middleware');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const documentsRoutes = require('./routes/documents.routes');
const verifyRoutes = require('./routes/verify.routes');
const trainingRoutes = require('./routes/training.routes');
const locationRoutes = require('./routes/location.routes');
const shiftsRoutes = require('./routes/shifts.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const walletRoutes = require('./routes/wallet.routes');
const bankRoutes = require('./routes/bank.routes');
const notificationRoutes = require('./routes/notification.routes');
const faqRoutes = require('./routes/faq.routes');
const supportTicketRoutes = require('./routes/supportTicket.routes');
const pushTokenRoutes = require('./routes/pushToken.routes');
const sampleRoutes = require('./routes/sample.routes');
const sharedOrdersRoutes = require('./routes/sharedOrders.routes');
const performanceRoutes = require('./routes/performance.routes');

const app = express();

// CORS: allow localhost/127.0.0.1 with any port (Expo web on 19006, 8081, etc.) and reflect other origins.
const corsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return callback(null, true);
    return callback(null, origin);
  },
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Health check for frontend "Test connection" (no auth, no DB required to respond)
app.get('/health', (req, res) => {
  const db = isDbConnected();
  res.status(200).json({ ok: true, db: !!db });
});

function requireDb(req, res, next) {
  if (isDbConnected()) return next();
  res.status(503).json({
    success: false,
    message: 'Database unavailable',
  });
}

app.use(requireDb);

const { cacheMiddleware } = require('../core/middleware');
const appConfig = require('../config/app');
app.use(cacheMiddleware(appConfig.cache.picker.default));

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/documents', documentsRoutes);
app.use('/verify', verifyRoutes);
app.use('/training', trainingRoutes);
app.use('/', locationRoutes); // Mounts at /locations
app.use('/shifts', shiftsRoutes);
app.use('/attendance', attendanceRoutes);
app.use('/wallet', walletRoutes);
app.use('/bank', bankRoutes);
app.use('/notifications', notificationRoutes);
app.use('/faqs', faqRoutes);
app.use('/support', supportTicketRoutes);
app.use('/api/push-tokens', pushTokenRoutes);
app.use('/api/samples', sampleRoutes);
app.use('/orders', sharedOrdersRoutes);
app.use('/performance', performanceRoutes);

app.use(errorHandler);

module.exports = app;
