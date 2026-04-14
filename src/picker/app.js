/**
 * Picker app – mobile-facing API for Picker app.
 * Phase 1 RBAC: Dashboard endpoints will be added separately with Admin/Finance/Warehouse
 * role checks. See picker/rbac.plan.js for intended roles per endpoint area.
 */
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const { isDbConnected } = require('./config/db');
const { errorHandler } = require('./middlewares/error.middleware');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const userController = require('./controllers/user.controller');
const { requireAuth } = require('./middlewares/auth.middleware');
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
const devicesRoutes = require('./routes/devices.routes');
const heartbeatRoutes = require('./routes/heartbeat.routes');
const managerRoutes = require('./routes/manager.routes');
const presenceRoutes = require('./routes/presence.routes');
const issueRoutes = require('./routes/issue.routes');
const { startPickerPresenceMonitor } = require('./jobs/pickerPresenceMonitor.job');
const onboardingRoutes = require('./routes/onboarding.routes');
const configRoutes = require('./routes/config.routes');
const legalRoutes = require('./routes/legalRoutes');
const adminLegalRoutes = require('./routes/admin/legalAdminRoutes');
const accountRoutes = require('./routes/account.routes');

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
// Scope GET cache by Authorization so different users never share an entry. Skip /documents so approval status is always fresh.
app.use(
  cacheMiddleware(appConfig.cache.picker.default, {
    skipPaths: ['/documents'],
    cacheKeyExtra: (req) => {
      const raw = typeof req.get === 'function' ? req.get('authorization') : req.headers?.authorization;
      if (!raw) return ':anon';
      return ':' + crypto.createHash('sha256').update(String(raw)).digest('hex').slice(0, 32);
    },
  })
);

app.use('/auth', authRoutes);
app.get('/me', requireAuth, userController.getProfile);
app.get('/me/link-status', requireAuth, userController.getLinkStatus);
app.use('/onboarding', onboardingRoutes);
app.use('/users', userRoutes);
app.use('/account', accountRoutes);
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
app.use('/devices', devicesRoutes);
app.use('/heartbeat', heartbeatRoutes);
app.use('/manager', managerRoutes);
app.use('/presence', presenceRoutes);
app.use('/issues', issueRoutes);
app.use('/config', configRoutes);
app.use('/legal', legalRoutes);
app.use('/admin/legal', adminLegalRoutes);

app.use(errorHandler);

try {
  if (String(process.env.DISABLE_PICKER_PRESENCE_MONITOR || '').toLowerCase() !== 'true') {
    startPickerPresenceMonitor();
  }
} catch (e) {
  console.warn('[picker app] presence monitor failed to start:', e?.message || e);
}

module.exports = app;
