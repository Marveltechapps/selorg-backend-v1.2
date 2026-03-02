const Order = require('../../warehouse/models/Order');
const Rider = require('../../rider/models/Rider');
const Vehicle = require('../../rider/models/Vehicle');
const MaintenanceTask = require('../../rider/models/MaintenanceTask');
const logger = require('../../core/utils/logger');

/**
 * Get rider performance metrics
 */
const getRiderPerformance = async (params = {}) => {
  try {
    const {
      granularity = 'day',
      startDate,
      endDate,
      dateRange = '7d',
    } = params;

    // Calculate date range
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    }

    // Optimization: Use aggregation to group orders by date
    const dateGrouping = {
      $dateToString: {
        format: granularity === 'hour' ? '%Y-%m-%dT%H:00:00Z' : granularity === 'day' ? '%Y-%m-%dZ' : '%Y-%W',
        date: '$createdAt'
      }
    };

    const orderStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: dateGrouping,
          deliveriesCompleted: { $sum: 1 },
          timestamp: { $first: '$createdAt' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Active riders count (static for now, ideally should be historical)
    const activeRidersCount = await Rider.countDocuments({ status: { $ne: 'offline' } });

    const data = orderStats.map(stat => ({
      timestamp: stat.timestamp.toISOString(),
      deliveriesCompleted: stat.deliveriesCompleted,
      averageRating: parseFloat((4.5 + Math.random() * 0.4).toFixed(1)), // Mock
      attendancePercent: parseFloat((85 + Math.random() * 15).toFixed(1)), // Mock
      activeRiders: activeRidersCount
    }));

    // Calculate summary
    const totalDeliveries = data.reduce((sum, d) => sum + d.deliveriesCompleted, 0);
    const avgRating = data.length > 0 ? data.reduce((sum, d) => sum + d.averageRating, 0) / data.length : 0;
    const avgAttendance = data.length > 0 ? data.reduce((sum, d) => sum + d.attendancePercent, 0) / data.length : 0;
    const peakActiveRiders = activeRidersCount;

    return {
      data,
      summary: {
        totalDeliveries,
        averageRating: parseFloat(avgRating.toFixed(1)),
        averageAttendance: parseFloat(avgAttendance.toFixed(1)),
        peakActiveRiders,
      },
    };
  } catch (error) {
    logger.error('Error getting rider performance:', error);
    throw error;
  }
};

/**
 * Get SLA adherence metrics
 */
const getSlaAdherence = async (params = {}) => {
  try {
    const {
      granularity = 'day',
      startDate,
      endDate,
      dateRange = '7d',
    } = params;

    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    }

    const slaStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $project: {
          createdAt: 1,
          isOnTime: {
            $cond: [
              { $and: [ { $ifNull: ["$completedAt", false] }, { $lte: ["$completedAt", "$slaDeadline"] } ] },
              1, 0
            ]
          },
          isBreach: {
            $cond: [
              { $or: [ { $eq: ["$status", "delayed"] }, { $and: [ { $ne: ["$status", "delivered"] }, { $lt: ["$slaDeadline", new Date()] } ] } ] },
              1, 0
            ]
          },
          delay: {
            $cond: [
              { $gt: ["$completedAt", "$slaDeadline"] },
              { $divide: [ { $subtract: ["$completedAt", "$slaDeadline"] }, 1000 * 60 ] },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: granularity === 'hour' ? '%Y-%m-%dT%H:00:00Z' : '%Y-%m-%dZ',
              date: '$createdAt'
            }
          },
          totalOrders: { $sum: 1 },
          onTimeOrders: { $sum: '$isOnTime' },
          slaBreaches: { $sum: '$isBreach' },
          totalDelay: { $sum: '$delay' },
          timestamp: { $first: '$createdAt' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const data = slaStats.map(stat => ({
      timestamp: stat.timestamp.toISOString(),
      onTimePercent: stat.totalOrders > 0 ? parseFloat(((stat.onTimeOrders / stat.totalOrders) * 100).toFixed(1)) : 0,
      slaBreaches: stat.slaBreaches,
      avgDelayMinutes: stat.onTimeOrders < stat.totalOrders ? parseFloat((stat.totalDelay / (stat.totalOrders - stat.onTimeOrders)).toFixed(1)) : 0,
      breachReasonBreakdown: {
        traffic: Math.floor(stat.slaBreaches * 0.6),
        no_show: Math.floor(stat.slaBreaches * 0.1),
        address_issue: Math.floor(stat.slaBreaches * 0.2),
        other: stat.slaBreaches - Math.floor(stat.slaBreaches * 0.6) - Math.floor(stat.slaBreaches * 0.1) - Math.floor(stat.slaBreaches * 0.2),
      }
    }));

    // Calculate summary
    const overallOnTimePercent = data.length > 0 ? data.reduce((sum, d) => sum + d.onTimePercent, 0) / data.length : 0;
    const totalBreaches = data.reduce((sum, d) => sum + d.slaBreaches, 0);
    const averageDelay = data.length > 0 ? data.reduce((sum, d) => sum + d.avgDelayMinutes, 0) / data.length : 0;

    return {
      data,
      summary: {
        overallOnTimePercent: parseFloat(overallOnTimePercent.toFixed(1)),
        totalBreaches,
        averageDelay: parseFloat(averageDelay.toFixed(1)),
        topBreachReason: 'traffic',
      },
    };
  } catch (error) {
    logger.error('Error getting SLA adherence:', error);
    throw error;
  }
};

/**
 * Get fleet utilization metrics
 */
const getFleetUtilization = async (params = {}) => {
  try {
    const {
      granularity = 'day',
      startDate,
      endDate,
      dateRange = '7d',
    } = params;

    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    }

    // This one is harder to aggregate historical snapshots without a snapshot collection
    // We'll keep a simplified version or use current data for mock points
    const totalVehicles = await Vehicle.countDocuments();
    const evVehiclesCount = await Vehicle.countDocuments({ fuelType: 'EV' });
    
    // Generate mock history based on current data
    const data = [];
    const now = new Date(start);
    while (now <= end) {
      const activeVehicles = Math.floor(totalVehicles * (0.7 + Math.random() * 0.2));
      const maintenanceVehicles = Math.floor(totalVehicles * (0.05 + Math.random() * 0.05));
      const idleVehicles = totalVehicles - activeVehicles - maintenanceVehicles;

      data.push({
        timestamp: now.toISOString(),
        activeVehicles,
        idleVehicles,
        maintenanceVehicles,
        evUtilizationPercent: parseFloat((70 + Math.random() * 20).toFixed(1)),
        avgKmPerVehicle: parseFloat((40 + Math.random() * 30).toFixed(1)),
      });

      if (granularity === 'hour') now.setHours(now.getHours() + 1);
      else if (granularity === 'day') now.setDate(now.getDate() + 1);
      else now.setDate(now.getDate() + 7);
    }

    return {
      data,
      summary: {
        totalVehicles,
        averageUtilization: parseFloat((data.reduce((sum, d) => sum + (d.activeVehicles / totalVehicles * 100), 0) / data.length).toFixed(1)),
        evUtilizationPercent: parseFloat((data.reduce((sum, d) => sum + d.evUtilizationPercent, 0) / data.length).toFixed(1)),
        totalKm: parseFloat((data.reduce((sum, d) => sum + (d.avgKmPerVehicle * totalVehicles), 0)).toFixed(1)),
      },
    };
  } catch (error) {
    logger.error('Error getting fleet utilization:', error);
    throw error;
  }
};

/**
 * Export report
 */
const exportReport = async (payload) => {
  try {
    const { metric, format, from, to } = payload;
    const reportId = `report-${metric}-${Date.now()}`;
    const reportUrl = `/api/v1/analytics/reports/download/${reportId}.${format}`;

    return {
      reportUrl,
      reportId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fileSize: 1024 * 1024 * 2, // 2MB mock
    };
  } catch (error) {
    logger.error('Error exporting report:', error);
    throw error;
  }
};

module.exports = {
  getRiderPerformance,
  getSlaAdherence,
  getFleetUtilization,
  exportReport,
};


module.exports = {
  getRiderPerformance,
  getSlaAdherence,
  getFleetUtilization,
  exportReport,
};

