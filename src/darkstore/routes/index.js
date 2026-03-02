const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Import all darkstore routes
const authRoutes = require('./authRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const orderRoutes = require('./orderRoutes');
const picklistRoutes = require('./picklistRoutes');
const pickerRoutes = require('./pickerRoutes');
const packingRoutes = require('./packingRoutes');
const inboundRoutes = require('./inboundRoutes');
const outboundRoutes = require('./outboundRoutes');
const qcRoutes = require('./qcRoutes');
const healthRoutes = require('./healthRoutes');
const staffRoutes = require('./staffRoutes');
const alertRoutes = require('./alertRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const hsdRoutes = require('./hsdRoutes');
const utilitiesRoutes = require('./utilitiesRoutes');
const settingsRoutes = require('./settingsRoutes');

// Auth (login only) - no JWT required
router.use('/auth', authRoutes);

// All other routes require JWT and role: darkstore, admin, super_admin; cache GET responses
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken, requireRole('darkstore', 'admin', 'super_admin'));
protectedRouter.use(cacheMiddleware(appConfig.cache.darkstore));
protectedRouter.use('/dashboard', dashboardRoutes);
protectedRouter.use('/inventory', inventoryRoutes);
protectedRouter.use('/orders', orderRoutes);
protectedRouter.use('/picklists', picklistRoutes);
protectedRouter.use('/pickers', pickerRoutes);
protectedRouter.use('/packing', packingRoutes);
protectedRouter.use('/inbound', inboundRoutes);
protectedRouter.use('/outbound', outboundRoutes);
protectedRouter.use('/qc', qcRoutes);
protectedRouter.use('/health', healthRoutes);
protectedRouter.use('/staff', staffRoutes);
protectedRouter.use('/alerts', alertRoutes);
protectedRouter.use('/analytics', analyticsRoutes);
protectedRouter.use('/hsd', hsdRoutes);
protectedRouter.use('/utilities', utilitiesRoutes);
protectedRouter.use('/settings', settingsRoutes);
router.use(protectedRouter);

module.exports = router;
