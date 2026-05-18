/**
 * API v1 Router
 * File: src/routes/api/v1/index.js
 *
 * P2.1: Mounts all v1 service routes (picker, rider, customer)
 * All routes are prefixed with /api/v1 by the parent router
 */

const express = require('express');
const router = express.Router();

// Picker service routes
const pickerAuthRoutes = require('./picker/auth.routes');
const pickerShiftsRoutes = require('./picker/shifts.routes');
const pickerWalletRoutes = require('./picker/wallet.routes');
const pickerKycRoutes = require('./picker/kyc.routes');

// Rider service routes
const riderAuthRoutes = require('./rider/auth.routes');
const riderDeliveriesRoutes = require('./rider/deliveries.routes');
const riderEarningsRoutes = require('./rider/earnings.routes');

// Customer service routes
const customerAuthRoutes = require('./customer/auth.routes');
const customerOrdersRoutes = require('./customer/orders.routes');
const customerPaymentsRoutes = require('./customer/payments.routes');

// Mount picker routes under /picker
router.use('/picker/auth', pickerAuthRoutes);
router.use('/picker/shifts', pickerShiftsRoutes);
router.use('/picker/wallet', pickerWalletRoutes);
router.use('/picker/kyc', pickerKycRoutes);

// Mount rider routes under /rider
router.use('/rider/auth', riderAuthRoutes);
router.use('/rider/deliveries', riderDeliveriesRoutes);
router.use('/rider/earnings', riderEarningsRoutes);

// Mount customer routes under /customer
router.use('/customer/auth', customerAuthRoutes);
router.use('/customer/orders', customerOrdersRoutes);
router.use('/customer/payments', customerPaymentsRoutes);

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API v1 is healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
