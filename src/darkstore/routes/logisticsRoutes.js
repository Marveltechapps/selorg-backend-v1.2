'use strict';

const express = require('express');
const { logisticsScope } = require('../../logistics/middleware/logisticsScope.middleware');
const ordersRoutes = require('../../logistics/routes/ordersRoutes');
const estimateRoutes = require('../../logistics/routes/estimateRoutes');

const router = express.Router();
router.use(logisticsScope('WAREHOUSE_TO_DARKSTORE'));
router.use((req, res, next) => {
  const pathOnly = (req.originalUrl || '').split('?')[0];
  if (
    req.method === 'POST' &&
    /\/logistics\/orders\/?$/.test(pathOnly) &&
    !pathOnly.includes('/cancel')
  ) {
    req.body = { ...(req.body || {}), type: 'WAREHOUSE_TO_DARKSTORE' };
  }
  next();
});
router.use('/orders', ordersRoutes);
router.use('/estimate', estimateRoutes);

module.exports = router;
