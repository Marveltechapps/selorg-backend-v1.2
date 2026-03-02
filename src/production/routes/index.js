const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Import all production routes
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
const maintenanceRoutes = require('./maintenanceRoutes');
const staffRoutes = require('./staffRoutes');
const alertRoutes = require('./alertRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const productionDashboardRoutes = require('./productionDashboardRoutes');
const hsdRoutes = require('./hsdRoutes');
const utilitiesRoutes = require('./utilitiesRoutes');
const settingsRoutes = require('./settingsRoutes');
const overviewRoutes = require('./overviewRoutes');
const factoriesRoutes = require('./factoriesRoutes');
const rawMaterialsGroupRoutes = require('./rawMaterialsGroupRoutes');
const planningRoutes = require('./planningRoutes');
const workOrdersRoutes = require('./workOrdersRoutes');

// Auth (login only) - no JWT required
router.use('/auth', authRoutes);

// All other routes require JWT and role: production, admin, super_admin; cache GET responses
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken, requireRole('production', 'admin', 'super_admin'));
protectedRouter.use(cacheMiddleware(appConfig.cache.production));
protectedRouter.use('/overview', overviewRoutes);
protectedRouter.use('/factories', factoriesRoutes);
protectedRouter.use('/raw-materials', rawMaterialsGroupRoutes);
protectedRouter.use('/planning', planningRoutes);
protectedRouter.use('/work-orders', workOrdersRoutes);
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
protectedRouter.use('/maintenance', maintenanceRoutes);
protectedRouter.use('/staff', staffRoutes);
protectedRouter.use('/alerts', alertRoutes);
protectedRouter.use('/analytics', analyticsRoutes);
protectedRouter.use('/hsd', hsdRoutes);
protectedRouter.use('/utilities', utilitiesRoutes);
protectedRouter.use('/settings', settingsRoutes);
protectedRouter.use('/dashboard', productionDashboardRoutes);
router.use(protectedRouter);

module.exports = router;
