/**
 * Customer app Express sub-app: onboarding, auth, home, products, categories, user, admin/home.
 * Mounted at /api/v1/customer by root server.js (routes are relative to that).
 */
const express = require('express');
const cors = require('cors');

const onboardingRoutes = require('./routes/onboardingRoutes');
const authRoutes = require('./routes/authRoutes');
const homeRoutes = require('./routes/homeRoutes');
const productsRoutes = require('./routes/productsRoutes');
const categoriesRoutes = require('./routes/categoriesRoutes');
const adminHomeRoutes = require('./routes/admin/homeAdminRoutes');
const adminOnboardingRoutes = require('./routes/admin/onboardingAdminRoutes');
const adminAppConfigRoutes = require('./routes/admin/appConfigAdminRoutes');
const adminCouponRoutes = require('./routes/admin/couponAdminRoutes');
const adminLegalRoutes = require('./routes/admin/legalAdminRoutes');
const adminCancellationPolicyRoutes = require('./routes/admin/cancellationPolicyAdminRoutes');
const adminNotificationRoutes = require('./routes/admin/notificationAdminRoutes');
const userRoutes = require('./routes/userRoutes');
const legalRoutes = require('./routes/legalRoutes');
const addressRoutes = require('./routes/addressRoutes');
const cartRoutes = require('./routes/cartRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const couponsRoutes = require('./routes/couponsRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');
const refundsRoutes = require('./routes/refundsRoutes');
const walletRoutes = require('./routes/walletRoutes');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const { cacheMiddleware } = require('../core/middleware');
const appConfig = require('../config/app');
app.use(cacheMiddleware(appConfig.cache.customer.default));

app.use('/onboarding', onboardingRoutes);
app.use('/auth', authRoutes);
app.use('/home', homeRoutes);
app.use('/products', productsRoutes);
app.use('/categories', categoriesRoutes);
app.use('/admin/home', adminHomeRoutes);
app.use('/admin/onboarding-pages', adminOnboardingRoutes);
app.use('/admin/app-config', adminAppConfigRoutes);
app.use('/admin/coupons', adminCouponRoutes);
app.use('/admin/legal', adminLegalRoutes);
app.use('/admin/cancellation-policies', adminCancellationPolicyRoutes);
app.use('/admin/notifications', adminNotificationRoutes);
app.use('/user', userRoutes);
app.use('/legal', legalRoutes);
app.use('/addresses', addressRoutes);
app.use('/cart', cartRoutes);
app.use('/orders', ordersRoutes);
app.use('/payments', paymentsRoutes);
app.use('/coupons', couponsRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/refunds', refundsRoutes);
app.use('/wallet', walletRoutes);

const { getPublicConfig } = require('./controllers/admin/appConfigAdminController');
app.get('/app-config', getPublicConfig);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

module.exports = app;
