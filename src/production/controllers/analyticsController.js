const Order = require('../models/Order');
const Rider = require('../models/Rider');
const Dispatch = require('../models/Dispatch');
const DispatchOrder = require('../models/DispatchOrder');
const Alert = require('../models/Alert');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');

/**
 * Get Rider Performance Metrics
 * GET /api/darkstore/analytics/rider-performance
 */
const getRiderPerformance = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const granularity = req.query.granularity || 'day';
    const dateRange = req.query.dateRange || '7d';

    // Calculate date range
    const now = new Date();
    const daysBack = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);

    // Generate data points based on granularity
    const dataPoints = [];
    const pointCount = granularity === 'hour' ? 24 : granularity === 'day' ? daysBack : Math.ceil(daysBack / 7);

    for (let i = 0; i < pointCount; i++) {
      const pointDate = new Date(startDate);
      if (granularity === 'hour') {
        pointDate.setHours(pointDate.getHours() + i);
      } else if (granularity === 'day') {
        pointDate.setDate(pointDate.getDate() + i);
      } else {
        pointDate.setDate(pointDate.getDate() + (i * 7));
      }

      // Mock calculations - in production, aggregate from actual data
      const deliveriesCompleted = Math.floor(Math.random() * 180) + 120;
      const averageRating = parseFloat((Math.random() * 0.7 + 4.2).toFixed(1));
      const attendancePercent = Math.floor(Math.random() * 15) + 85;
      const activeRiders = Math.floor(Math.random() * 20) + 40;

      dataPoints.push({
        timestamp: pointDate.toISOString(),
        deliveriesCompleted: deliveriesCompleted,
        averageRating: averageRating,
        attendancePercent: attendancePercent,
        activeRiders: activeRiders,
      });
    }

    // Calculate summary
    const totalDeliveries = dataPoints.reduce((sum, p) => sum + p.deliveriesCompleted, 0);
    const avgRating = parseFloat((dataPoints.reduce((sum, p) => sum + p.averageRating, 0) / dataPoints.length).toFixed(1));
    const avgAttendance = Math.floor(dataPoints.reduce((sum, p) => sum + p.attendancePercent, 0) / dataPoints.length);
    const peakActiveRiders = Math.max(...dataPoints.map(p => p.activeRiders));

    res.status(200).json({
      success: true,
      data: dataPoints,
      summary: {
        totalDeliveries: totalDeliveries,
        avgRating: avgRating,
        avgAttendance: avgAttendance,
        peakActiveRiders: peakActiveRiders,
      },
    });
  } catch (error) {
    logger.error('Get rider performance error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch rider performance',
    });
  }
};

/**
 * Get SLA Adherence Metrics
 * GET /api/darkstore/analytics/sla-adherence
 */
const getSlaAdherence = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const granularity = req.query.granularity || 'day';
    const dateRange = req.query.dateRange || '7d';

    // Calculate date range
    const now = new Date();
    const daysBack = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);

    // Generate data points
    const dataPoints = [];
    const pointCount = granularity === 'hour' ? 24 : granularity === 'day' ? daysBack : Math.ceil(daysBack / 7);

    for (let i = 0; i < pointCount; i++) {
      const pointDate = new Date(startDate);
      if (granularity === 'hour') {
        pointDate.setHours(pointDate.getHours() + i);
      } else if (granularity === 'day') {
        pointDate.setDate(pointDate.getDate() + i);
      } else {
        pointDate.setDate(pointDate.getDate() + (i * 7));
      }

      // Mock calculations
      const onTimePercent = parseFloat((Math.random() * 10 + 88).toFixed(1));
      const slaBreaches = Math.floor(Math.random() * 13) + 2;
      const avgDelayMinutes = parseFloat((Math.random() * 6 + 2).toFixed(1));

      dataPoints.push({
        timestamp: pointDate.toISOString(),
        onTimePercent: onTimePercent,
        slaBreaches: slaBreaches,
        avgDelayMinutes: avgDelayMinutes,
        breachReasonBreakdown: {
          traffic: Math.floor(Math.random() * 9) + 1,
          no_show: Math.floor(Math.random() * 3),
          address_issue: Math.floor(Math.random() * 5),
          other: Math.floor(Math.random() * 2),
        },
      });
    }

    // Calculate summary
    const overallOnTimePercent = parseFloat((dataPoints.reduce((sum, p) => sum + p.onTimePercent, 0) / dataPoints.length).toFixed(1));
    const totalBreaches = dataPoints.reduce((sum, p) => sum + p.slaBreaches, 0);
    const avgDelayMinutes = parseFloat((dataPoints.reduce((sum, p) => sum + p.avgDelayMinutes, 0) / dataPoints.length).toFixed(1));

    res.status(200).json({
      success: true,
      data: dataPoints,
      summary: {
        overallOnTimePercent: overallOnTimePercent,
        totalBreaches: totalBreaches,
        avgDelayMinutes: avgDelayMinutes,
      },
    });
  } catch (error) {
    logger.error('Get SLA adherence error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch SLA adherence',
    });
  }
};

/**
 * Get Fleet Utilization Metrics
 * GET /api/darkstore/analytics/fleet-utilization
 */
const getFleetUtilization = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const granularity = req.query.granularity || 'day';
    const dateRange = req.query.dateRange || '7d';

    // Calculate date range
    const now = new Date();
    const daysBack = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);

    // Generate data points
    const dataPoints = [];
    const pointCount = granularity === 'hour' ? 24 : granularity === 'day' ? daysBack : Math.ceil(daysBack / 7);

    for (let i = 0; i < pointCount; i++) {
      const pointDate = new Date(startDate);
      if (granularity === 'hour') {
        pointDate.setHours(pointDate.getHours() + i);
      } else if (granularity === 'day') {
        pointDate.setDate(pointDate.getDate() + i);
      } else {
        pointDate.setDate(pointDate.getDate() + (i * 7));
      }

      const active = Math.floor(Math.random() * 20) + 50;
      const maintenance = Math.floor(Math.random() * 6) + 2;
      const idle = 85 - active - maintenance;

      dataPoints.push({
        timestamp: pointDate.toISOString(),
        activeVehicles: active,
        idleVehicles: idle,
        maintenanceVehicles: maintenance,
        evUtilizationPercent: parseFloat((Math.random() * 35 + 40).toFixed(1)),
        avgKmPerVehicle: parseFloat((Math.random() * 25 + 20).toFixed(1)),
      });
    }

    // Calculate summary
    const avgUtilizationPercent = parseFloat((dataPoints.reduce((sum, p) => {
      const total = p.activeVehicles + p.idleVehicles + p.maintenanceVehicles;
      return sum + (p.activeVehicles / total * 100);
    }, 0) / dataPoints.length).toFixed(1));
    const totalActiveHours = dataPoints.reduce((sum, p) => sum + p.activeVehicles, 0) * 24;
    const totalIdleHours = dataPoints.reduce((sum, p) => sum + p.idleVehicles, 0) * 24;
    const avgKmPerVehicle = parseFloat((dataPoints.reduce((sum, p) => sum + p.avgKmPerVehicle, 0) / dataPoints.length).toFixed(1));

    res.status(200).json({
      success: true,
      data: dataPoints,
      summary: {
        avgUtilizationPercent: avgUtilizationPercent,
        totalActiveHours: totalActiveHours,
        totalIdleHours: totalIdleHours,
        avgKmPerVehicle: avgKmPerVehicle,
      },
    });
  } catch (error) {
    logger.error('Get fleet utilization error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch fleet utilization',
    });
  }
};

/**
 * Export Report
 * POST /api/darkstore/analytics/export
 */
const exportReport = async (req, res) => {
  try {
    const { metric, format, dateRange, includeCharts, includeSummary } = req.body;

    if (!metric || !format || !dateRange) {
      return res.status(400).json({
        success: false,
        error: 'metric, format, and dateRange are required',
      });
    }

    // Generate report ID
    const reportId = generateId('RPT');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    // In production, this would generate actual report file
    // For now, return mock URL
    const reportUrl = `https://storage.example.com/reports/${reportId}.${format}`;

    res.status(200).json({
      success: true,
      reportUrl: reportUrl,
      reportId: reportId,
      expiresAt: expiresAt.toISOString(),
      message: 'Report generated successfully',
    });
  } catch (error) {
    logger.error('Export report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export report',
    });
  }
};

module.exports = {
  getRiderPerformance,
  getSlaAdherence,
  getFleetUtilization,
  exportReport,
};

