const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');
const { bindVendorHubContext } = require('../middleware/vendorHubContext');

// Import all vendor routes
const authRoutes = require('./authRoutes');
const publicVendorRoutes = require('./publicVendorRoutes');
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
const vendorController = require('../controllers/vendorController2');

// Auth (login only) - no JWT required
router.use('/auth', authRoutes);

// Public vendor onboarding routes (no JWT)
router.use('/public', publicVendorRoutes);

// All other routes require JWT and role: vendor, admin, super_admin; cache GET responses
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken, requireRole('vendor', 'admin', 'super_admin'));
protectedRouter.use(bindVendorHubContext);
protectedRouter.use(
  cacheMiddleware(appConfig.cache.vendor, { cacheKeyExtra: (req) => (req.vendorHubKey ? `:${req.vendorHubKey}` : '') })
);

// Email templates/actions (authenticated)
protectedRouter.post('/vendors/send-invite-email', vendorController.sendInviteEmail);
protectedRouter.post('/vendors/send-doc-request-email', vendorController.sendDocumentRequestEmail);
protectedRouter.post('/vendors/send-payment-email', vendorController.sendPaymentEmail);
protectedRouter.post('/vendors/send-rejection-email', vendorController.sendRejectionEmail);
protectedRouter.get('/vendors/email-preview/:templateName', vendorController.getEmailTemplatePreview);

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
