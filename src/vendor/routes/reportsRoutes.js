const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { authenticateToken } = require('../../core/middleware/auth.middleware');
const asyncHandler = require('../../middleware/asyncHandler');

// All routes require authentication
router.use(authenticateToken);

router.get('/sales/overview', asyncHandler(reportsController.getSalesOverview));
router.get('/sales/data', asyncHandler(reportsController.getSalesData));
router.get('/products/performance', asyncHandler(reportsController.getProductPerformance));
router.get('/orders/analytics', asyncHandler(reportsController.getOrderAnalytics));
router.get('/revenue/category', asyncHandler(reportsController.getRevenueByCategory));
router.get('/sales/hourly', asyncHandler(reportsController.getHourlySales));
router.get('/financial/summary', asyncHandler(reportsController.getFinancialSummary));
router.get('/customers/insights', asyncHandler(reportsController.getCustomerInsights));
router.get('/customers/top', asyncHandler(reportsController.getTopCustomers));

module.exports = router;
