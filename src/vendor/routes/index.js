const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Import all vendor routes
const authRoutes = require('./authRoutes');
const vendorRoutes = require('./vendorRoutes');
const inboundRoutes = require('./inboundRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const purchaseOrderRoutes = require('./purchaseOrderRoutes');
const qcRoutes = require('./qcRoutes');
const certificatesRoutes = require('./certificatesRoutes');
const webhooksRoutes = require('./webhooksRoutes');
const reportsRoutes = require('./reportsRoutes');
const qcComplianceRoutes = require('./qcComplianceRoutes');
const procurementApprovalsRoutes = require('./procurementApprovalsRoutes');
const utilitiesRoutes = require('./utilitiesRoutes');

// Auth (login only) - no JWT required
router.use('/auth', authRoutes);

// All other routes require JWT and role: vendor, admin, super_admin; cache GET responses
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken, requireRole('vendor', 'admin', 'super_admin'));
protectedRouter.use(cacheMiddleware(appConfig.cache.vendor));
protectedRouter.use('/vendors', vendorRoutes);
protectedRouter.use('/inbound', inboundRoutes);
protectedRouter.use('/inventory', inventoryRoutes);
protectedRouter.use('/purchase-orders', purchaseOrderRoutes);
protectedRouter.use('/qc', qcRoutes);
protectedRouter.use('/', certificatesRoutes);
protectedRouter.use('/webhooks', webhooksRoutes);
protectedRouter.use('/reports', reportsRoutes);
protectedRouter.use('/qc-compliance', qcComplianceRoutes);
protectedRouter.use('/approvals', procurementApprovalsRoutes);
protectedRouter.use('/utilities', utilitiesRoutes);
protectedRouter.use('/system-gateway', require('./systemGatewayRoutes'));
router.use(protectedRouter);

module.exports = router;
