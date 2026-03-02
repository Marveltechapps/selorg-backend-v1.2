/**
 * Admin Analytics Routes
 * Mounted at /api/v1/admin/analytics
 */

const express = require('express');
const router = express.Router();
const { cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');
const analyticsController = require('../controllers/analyticsController');

const ttl = appConfig.cache?.admin?.default ?? appConfig.cache?.analytics ?? 60;

router.get('/realtime', cacheMiddleware(ttl), analyticsController.getRealtimeMetrics);
router.get('/timeseries', cacheMiddleware(ttl), analyticsController.getTimeSeriesData);
router.get('/products', cacheMiddleware(ttl), analyticsController.getProductPerformance);
router.get('/categories', cacheMiddleware(ttl), analyticsController.getCategoryAnalytics);
router.get('/regional', cacheMiddleware(ttl), analyticsController.getRegionalPerformance);
router.get('/customers', cacheMiddleware(ttl), analyticsController.getCustomerMetrics);
router.get('/operational', cacheMiddleware(ttl), analyticsController.getOperationalMetrics);
router.get('/revenue', cacheMiddleware(ttl), analyticsController.getRevenueBreakdown);
router.get('/growth', cacheMiddleware(ttl), analyticsController.getGrowthTrends);
router.get('/peak-hours', cacheMiddleware(ttl), analyticsController.getPeakHours);
router.get('/funnel', cacheMiddleware(ttl), analyticsController.getConversionFunnel);
router.get('/payment-methods', cacheMiddleware(ttl), analyticsController.getPaymentMethods);

// Template reports
router.get('/orders-by-hour', cacheMiddleware(ttl), analyticsController.getOrdersByHour);
router.get('/rider-performance', cacheMiddleware(ttl), analyticsController.getRiderPerformance);
router.get('/inventory-health', cacheMiddleware(ttl), analyticsController.getInventoryHealth);
router.get('/financial-summary', cacheMiddleware(ttl), analyticsController.getFinancialSummary);

// Custom report builder
router.post('/custom-report', analyticsController.createCustomReport);

// Export
router.get('/export', analyticsController.exportReport);

module.exports = router;
