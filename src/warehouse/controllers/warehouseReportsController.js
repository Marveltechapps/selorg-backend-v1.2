const warehouseReportsService = require('../services/warehouseReportsService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Warehouse Reports & Analytics Controller
 */
const warehouseReportsController = {
  getOperationalSLAs: asyncHandler(async (req, res) => {
    const metrics = await warehouseReportsService.getSLAMetrics(req.query.range);
    // Map service output to schema SLAMetrics shape
    const payload = {
      inboundTurnaround: metrics.dockTurnaroundTime || null,
      outboundOnTime: metrics.outboundSLA || null,
      pickingSpeedUPH: metrics.pickingSpeedUPH || null,
      orderAccuracy: metrics.orderAccuracy || null
    };
    res.status(200).json({ success: true, data: payload, meta: { period: metrics.period || 'today' } });
  }),

  exportSLAMetrics: asyncHandler(async (req, res) => {
    const metrics = await warehouseReportsService.getSLAMetrics(req.query.range);
    const csv = `metric,value\nInbound SLA,${metrics.inboundSLA}\nOutbound SLA,${metrics.outboundSLA}`;
    res.status(200).json({ success: true, data: { csv }, meta: { message: 'CSV export initiated' } });
  }),

  getInventoryHealth: asyncHandler(async (req, res) => {
    const health = await warehouseReportsService.getInventoryHealth();
    // Map to InventoryHealth schema where possible
    const payload = {
      accuracy: health.stockAccuracy || null,
      shrinkage: health.excessStockValue || null,
      turnoverRateDays: health.turnoverRateDays || null,
      expiringSoon: health.expiringSoon || 0,
      stockouts: health.outOfStockRate || 0
    };
    res.status(200).json({ success: true, data: payload });
  }),

  exportInventoryHealth: asyncHandler(async (req, res) => {
    const health = await warehouseReportsService.getInventoryHealth();
    const csv = `metric,value\nHealth Score,${health.healthScore}\nTotal SKUs,${health.totalSKUs}`;
    res.status(200).json({ success: true, data: { csv }, meta: { message: 'CSV export initiated' } });
  }),

  getProductivity: asyncHandler(async (req, res) => {
    const productivity = await warehouseReportsService.getProductivityMetrics();
    // Map to ProductivityMetrics schema
    const payload = {
      avgUPH: productivity.averagePicksPerHour || null,
      errorRateChange: productivity.errorRateChange || null,
      attendanceRate: productivity.attendanceRate || null,
      activeStaff: productivity.activeStaff || null,
      totalStaff: productivity.totalStaff || null
    };
    res.status(200).json({ success: true, data: payload });
  }),

  exportProductivity: asyncHandler(async (req, res) => {
    const productivity = await warehouseReportsService.getProductivityMetrics();
    const csv = `metric,value\nAvg Picks/hr,${productivity.averagePicksPerHour}\nUtilization,${productivity.utilizationRate}`;
    res.status(200).json({ success: true, data: { csv }, meta: { message: 'CSV export initiated' } });
  }),

  getStorageUtilization: asyncHandler(async (req, res) => {
    const utilization = await warehouseReportsService.getStorageUtilization();
    res.status(200).json({ success: true, data: utilization, meta: { count: utilization.length } });
  }),

  getOutputTrends: asyncHandler(async (req, res) => {
    const trends = await warehouseReportsService.getOutputTrends();
    res.status(200).json({ success: true, data: trends, meta: { count: trends.length } });
  }),

  getInventoryByCategory: asyncHandler(async (req, res) => {
    const breakdown = await warehouseReportsService.getInventoryByCategory();
    res.status(200).json({ success: true, data: breakdown, meta: { count: breakdown.length } });
  })
};

module.exports = warehouseReportsController;

