const Order = require('../models/Order');
const Staff = require('../models/Staff');
const StockAlert = require('../models/StockAlert');
const RTOAlert = require('../models/RTOAlert');
const { calculateSLATimer, getSLAStatus, formatWaitTime, calculatePeakTime, generateLastHourData } = require('../../utils/helpers');

/**
 * Get Dashboard Summary
 * GET /api/darkstore/dashboard/summary
 */
const getDashboardSummary = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;

    // Get all active orders
    const orders = await Order.find({
      store_id: storeId,
      status: { $in: ['new', 'processing', 'ready'] },
    }).lean();

    // Calculate queue metrics
    const newOrders = orders.filter((o) => o.status === 'new').length;
    const breakdown = {
      normal: orders.filter((o) => o.order_type === 'Normal').length,
      priority: orders.filter((o) => o.order_type === 'Priority').length,
      express: orders.filter((o) => o.order_type === 'Express').length,
    };
    // Ensure total = normal + priority + express (as per requirements)
    // Only count orders with Normal, Priority, or Express types
    const total = breakdown.normal + breakdown.priority + breakdown.express;

    // Calculate SLA threat metrics
    const now = new Date();
    const ordersAtRisk = orders.filter((order) => {
      if (!order.sla_deadline) return false;
      const diff = new Date(order.sla_deadline) - now;
      const minutes = Math.floor(diff / 60000);
      return minutes < 15 && minutes >= 0;
    }).length;

    const ordersUnder5Min = orders.filter((order) => {
      if (!order.sla_deadline) return false;
      const diff = new Date(order.sla_deadline) - now;
      const minutes = Math.floor(diff / 60000);
      return minutes < 5 && minutes >= 0;
    }).length;

    const slaThreatPercentage = total > 0 ? Math.round((ordersAtRisk / total) * 100) : 0;

    // Calculate store capacity (based on active staff and orders)
    const activeStaff = await Staff.countDocuments({
      store_id: storeId,
      is_active: true,
    });
    const maxCapacity = 100; // This could be configurable
    const capacityPercentage = Math.min(Math.round((activeStaff / maxCapacity) * 100), 100);

    // Calculate rider wait times (simplified - in production would use actual wait time data)
    const averageWaitSeconds = 252; // 4m 12s in seconds
    const averageWait = formatWaitTime(averageWaitSeconds);
    const lastHourData = generateLastHourData();

    res.status(200).json({
      queue: {
        total,
        new_orders: newOrders,
        breakdown,
      },
      sla_threat: {
        percentage: slaThreatPercentage,
        orders_at_risk: ordersAtRisk,
        orders_under_5min: ordersUnder5Min,
      },
      store_capacity: {
        percentage: capacityPercentage,
        expected_peak_time: calculatePeakTime(),
      },
      rider_wait_times: {
        average: averageWait,
        last_hour_data: lastHourData,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard summary',
    });
  }
};

/**
 * Get Staff Load Metrics
 * GET /api/darkstore/dashboard/staff-load
 */
const getStaffLoad = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;

    const pickers = await Staff.find({
      store_id: storeId,
      role: 'picker',
    }).lean();

    const packers = await Staff.find({
      store_id: storeId,
      role: 'packer',
    }).lean();

    const activePickers = pickers.filter((p) => p.is_active);
    const activePackers = packers.filter((p) => p.is_active);

    const pickerLoadPercentage =
      pickers.length > 0
        ? Math.round((activePickers.length / pickers.length) * 100)
        : 0;

    const packerLoadPercentage =
      packers.length > 0
        ? Math.round((activePackers.length / packers.length) * 100)
        : 0;

    res.status(200).json({
      pickers: {
        active: activePickers.length,
        total: pickers.length,
        load_percentage: pickerLoadPercentage,
      },
      packers: {
        active: activePackers.length,
        total: packers.length,
        load_percentage: packerLoadPercentage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch staff load',
    });
  }
};

/**
 * Get Stock Alerts
 * GET /api/darkstore/dashboard/stock-alerts
 */
const getStockAlerts = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const severity = req.query.severity || 'all';

    const query = { store_id: storeId, is_restocked: false };
    if (severity !== 'all') {
      query.severity = severity;
    }

    const alerts = await StockAlert.find(query)
      .sort({ severity: -1, current_count: 1 })
      .lean();

    res.status(200).json({
      alerts: alerts.map((alert) => ({
        item_name: alert.item_name,
        sku: alert.sku,
        current_count: alert.current_count,
        threshold: alert.threshold,
        severity: alert.severity,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch stock alerts',
    });
  }
};

/**
 * Get RTO Alerts
 * GET /api/darkstore/dashboard/rto-alerts
 */
const getRTOAlerts = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;

    const alerts = await RTOAlert.find({
      store_id: storeId,
      is_resolved: false,
    })
      .sort({ severity: -1, createdAt: -1 })
      .lean();

    res.status(200).json({
      alerts: alerts.map((alert) => ({
        order_id: alert.order_id,
        issue_type: alert.issue_type,
        description: alert.description,
        severity: alert.severity,
        customer_reachable: alert.customer_reachable,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch RTO alerts',
    });
  }
};

/**
 * Get Live Orders
 * GET /api/darkstore/dashboard/live-orders
 */
const getLiveOrders = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const status = req.query.status || 'all';
    let limit = parseInt(req.query.limit) || 50;

    if (limit > 100) limit = 100;
    if (limit < 1) limit = 50;

    const query = {
      store_id: storeId,
      status: { $in: ['new', 'processing', 'ready'] },
    };

    if (status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const formattedOrders = orders.map((order) => {
      // Calculate SLA deadline: 15 minutes from order creation
      const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
      const slaDeadline = new Date(createdAt.getTime() + 15 * 60 * 1000); // 15 minutes
      
      const slaTimer = calculateSLATimer(slaDeadline);
      const slaStatus = getSLAStatus(slaDeadline);

      return {
        order_id: order.order_id,
        order_type: order.order_type,
        item_count: order.item_count,
        sla_timer: slaTimer,
        sla_status: slaStatus,
        sla_deadline: slaDeadline.toISOString(), // Include for real-time calculation
        created_at: createdAt.toISOString(),
        assignee: order.assignee || {
          id: '',
          name: 'Unassigned',
          initials: 'UA',
        },
      };
    });

    res.status(200).json({
      orders: formattedOrders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch live orders',
    });
  }
};

/**
 * Refresh Dashboard
 * POST /api/darkstore/dashboard/refresh
 */
const refreshDashboard = async (req, res) => {
  try {
    const storeId = req.query.storeId || req.body.storeId || process.env.DEFAULT_STORE_ID;

    // In a real implementation, this might trigger cache invalidation,
    // data recalculation, or other refresh operations
    const refreshedAt = new Date().toISOString();

    res.status(200).json({
      success: true,
      refreshed_at: refreshedAt,
      message: 'Dashboard refreshed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to refresh dashboard',
    });
  }
};

module.exports = {
  getDashboardSummary,
  getStaffLoad,
  getStockAlerts,
  getRTOAlerts,
  getLiveOrders,
  refreshDashboard,
};

