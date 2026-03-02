const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Import all warehouse routes
const authRoutes = require('./authRoutes');
const warehouseRoutes = require('./warehouseRoutes');
const inboundRoutes = require('./inboundRoutes');
const outboundRoutes = require('./outboundRoutes');
const transfersRoutes = require('./transfersRoutes');
const qcRoutes = require('./qcRoutes');
const workforceRoutes = require('./workforceRoutes');
const equipmentRoutes = require('./equipmentRoutes');
const exceptionsRoutes = require('./exceptionsRoutes');
const warehouseReportsRoutes = require('./warehouseReportsRoutes');
const utilitiesRoutes = require('./utilitiesRoutes');
const orderRoutes = require('./orderRoutes');
const staffRoutes = require('./staffRoutes');
const inventoryRoutes = require('./inventoryRoutes');

// Auth (login only) - no JWT required
router.use('/auth', authRoutes);

// All other routes require JWT and role: warehouse, admin, super_admin; cache GET responses
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken, requireRole('warehouse', 'admin', 'super_admin'));
protectedRouter.use(cacheMiddleware(appConfig.cache.warehouse));
protectedRouter.use('/', warehouseRoutes);
protectedRouter.use('/inbound', inboundRoutes);
protectedRouter.use('/inventory', inventoryRoutes);
protectedRouter.use('/outbound', outboundRoutes);
protectedRouter.use('/transfers', transfersRoutes);
protectedRouter.use('/qc', qcRoutes);
protectedRouter.use('/workforce', workforceRoutes);
protectedRouter.use('/equipment', equipmentRoutes);
protectedRouter.use('/exceptions', exceptionsRoutes);
protectedRouter.use('/reports', warehouseReportsRoutes);
protectedRouter.use('/utilities', utilitiesRoutes);
protectedRouter.use('/orders', orderRoutes);
protectedRouter.use('/staff', staffRoutes);
router.use(protectedRouter);

module.exports = router;
