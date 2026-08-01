/**
 * Customer app Express sub-app: onboarding, auth, home, products, categories, user, admin/home.
 * Mounted at /api/v1/customer by root server.js (routes are relative to that).
 */
const express = require('express');
const cors = require('cors');

const onboardingRoutes = require('./routes/onboardingRoutes');
const authRoutes = require('./routes/authRoutes');
const homeRoutes = require('./routes/homeRoutes');
const bannersRoutes = require('./routes/bannersRoutes');
const bootstrapRoutes = require('./routes/bootstrapRoutes');
const pagesRoutes = require('./routes/pagesRoutes');
const collectionsRoutes = require('./routes/collectionsRoutes');
const sectionsRoutes = require('./routes/sectionsRoutes');
const searchRoutes = require('./routes/searchRoutes');
const productsRoutes = require('./routes/productsRoutes');
const categoriesRoutes = require('./routes/categoriesRoutes');
const adminHomeRoutes = require('./routes/admin/homeAdminRoutes');
const cmsAdminRoutes = require('./routes/admin/cmsAdminRoutes');
const adminOnboardingRoutes = require('./routes/admin/onboardingAdminRoutes');
const adminAppConfigRoutes = require('./routes/admin/appConfigAdminRoutes');
const adminCouponRoutes = require('./routes/admin/couponAdminRoutes');
const adminLegalRoutes = require('./routes/admin/legalAdminRoutes');
const adminCancellationPolicyRoutes = require('./routes/admin/cancellationPolicyAdminRoutes');
const adminNotificationRoutes = require('./routes/admin/notificationAdminRoutes');
const adminFaqRoutes = require('./routes/admin/faqAdminRoutes');
const faqRoutes = require('./routes/faqRoutes');
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
const supportRoutes = require('./routes/supportRoutes');
const storeRoutes = require('./routes/storeRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const locationsRoutes = require('./routes/locationsRoutes');
const adminMerchRoutes = require('./routes/adminRoutes');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const { cacheMiddleware } = require('../core/middleware');
const appConfig = require('../config/app');
const customerCache = appConfig.cache.customer || {};

/**
 * Route-aware TTL for public GETs (no Redis). Longer for relatively static catalogs.
 */
function customerCacheTtl(req) {
  const p = req.path || '';
  if (p.startsWith('/faq') || p.startsWith('/legal') || p.startsWith('/app-config')) {
    return customerCache.legal || 300;
  }
  if (p.startsWith('/categories')) {
    return customerCache.categories || 120;
  }
  if (p.startsWith('/home') || p.startsWith('/sections') || p.startsWith('/banners')) {
    return customerCache.home || 60;
  }
  if (p.startsWith('/products') && !p.includes('/search')) {
    return customerCache.products || 60;
  }
  // Search must stay fresh for stock/relevance — skip via 0 when configured
  if (p.includes('/search')) {
    return typeof customerCache.search === 'number' ? customerCache.search : 0;
  }
  return customerCache.default || 60;
}

// Cart and addresses are per-user and change often — never cache those GETs.
// Bootstrap is cached inside bootstrapService (shared home graph + per-request address).
app.use(
  cacheMiddleware(customerCache.default || 60, {
    skipPaths: ['/bootstrap', '/cart', '/addresses', '/user', '/wallet', '/notifications', '/orders'],
    ttlResolver: customerCacheTtl,
  }),
);

app.use('/onboarding', onboardingRoutes);
app.use('/auth', authRoutes);
app.use('/home', homeRoutes);
app.use('/banners', bannersRoutes);
app.use('/bootstrap', bootstrapRoutes);
app.use('/pages', pagesRoutes);
app.use('/collections', collectionsRoutes);
app.use('/sections', sectionsRoutes);
app.use('/search', searchRoutes);
app.use('/products', productsRoutes);
app.use('/categories', categoriesRoutes);
app.use('/admin/home', adminHomeRoutes);
app.use('/admin', adminHomeRoutes); // Alias for spec-compatible admin endpoint base
app.use('/admin/cms', cmsAdminRoutes);
app.use('/admin/onboarding-pages', adminOnboardingRoutes);
app.use('/admin/app-config', adminAppConfigRoutes);
app.use('/admin/coupons', adminCouponRoutes);
app.use('/admin/legal', adminLegalRoutes);
app.use('/admin/cancellation-policies', adminCancellationPolicyRoutes);
app.use('/admin/notifications', adminNotificationRoutes);
app.use('/admin/faq', adminFaqRoutes);
app.use('/admin/merch', adminMerchRoutes);
app.use('/user', userRoutes);
app.use('/legal', legalRoutes);
app.use('/faq', faqRoutes);
app.use('/addresses', addressRoutes);
app.use('/cart', cartRoutes);
app.use('/orders', ordersRoutes);
app.use('/payments', paymentsRoutes);
app.use('/coupons', couponsRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/refunds', refundsRoutes);
app.use('/wallet', walletRoutes);
app.use('/support', supportRoutes);
app.use('/store', storeRoutes);
app.use('/delivery', deliveryRoutes);
app.use('/locations', locationsRoutes);

const { getPublicConfig } = require('./controllers/admin/appConfigAdminController');
app.get('/app-config', getPublicConfig);

const CUSTOMER_BACKEND_PORT = Number(process.env.PORT) || 3333;

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'customer',
    port: CUSTOMER_BACKEND_PORT,
    hint: 'If npm run dev shows "Port already in use", another backend instance is already listening on this port.',
  });
});
app.head('/health', (_req, res) => {
  res.status(200).end();
});

module.exports = app;
