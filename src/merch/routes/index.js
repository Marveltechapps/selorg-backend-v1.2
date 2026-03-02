const express = require('express');
const { authenticateToken, requireRole, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');
const authRoutes = require('./authRoutes');
const merchRoutes = require('./merchRoutes');
const catalogRoutes = require('./catalogRoutes');
const pricingRoutes = require('./pricingRoutes');
const allocationRoutes = require('./allocationRoutes');
const geofenceRoutes = require('./geofenceRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const alertRoutes = require('./alertRoutes');
const complianceRoutes = require('./complianceRoutes');
const citywideRoutes = require('./citywideRoutes');

const router = express.Router();

// Auth (login only) - no JWT required
router.use('/auth', authRoutes);

// All other routes require JWT and role: merch, admin, super_admin; cache GET responses
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken, requireRole('merch', 'admin', 'super_admin'));
protectedRouter.use(cacheMiddleware(appConfig.cache.merch));
protectedRouter.use('/', merchRoutes);
protectedRouter.use('/catalog', catalogRoutes);
protectedRouter.use('/pricing', pricingRoutes);
protectedRouter.use('/allocation', allocationRoutes);
protectedRouter.use('/geofence', geofenceRoutes);
protectedRouter.use('/analytics', analyticsRoutes);
protectedRouter.use('/alerts', alertRoutes);
protectedRouter.use('/compliance', complianceRoutes);
protectedRouter.use('/citywide', citywideRoutes);
router.use(protectedRouter);

module.exports = router;
