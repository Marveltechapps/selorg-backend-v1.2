'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken, requireRole } = require('../../core/middleware');
const healthRoutes = require('./healthRoutes');
const ordersRoutes = require('./ordersRoutes');
const estimateRoutes = require('./estimateRoutes');
const adminLogisticsRoutes = require('./adminLogisticsRoutes');
const { ingestPorter } = require('../controllers/porterWebhook.controller');

const router = express.Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use('/health', healthRoutes);

router.post('/webhooks/porter', webhookLimiter, ingestPorter);

const ops = express.Router();
ops.use(authenticateToken, requireRole('admin', 'super_admin', 'warehouse', 'darkstore'));
ops.use('/orders', ordersRoutes);
ops.use('/estimate', estimateRoutes);

const adminOnly = express.Router();
adminOnly.use(authenticateToken, requireRole('admin', 'super_admin'));
adminOnly.use('/admin', adminLogisticsRoutes);

router.use(ops);
router.use(adminOnly);

module.exports = router;
