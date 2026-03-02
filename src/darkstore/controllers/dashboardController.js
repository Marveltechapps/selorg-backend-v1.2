const Order = require('../models/Order');
const Staff = require('../models/Staff');
const StockAlert = require('../models/StockAlert');
const RTOAlert = require('../models/RTOAlert');
const { calculateSLATimer, getSLAStatus, formatWaitTime, calculatePeakTime, generateLastHourData } = require('../../utils/helpers');
const { getCachedOrCompute } = require('../../utils/cacheHelper');
const cache = require('../../utils/cache');
const appConfig = require('../../config/app');

/**
 * Get Dashboard Summary
 * GET /api/darkstore/dashboard/summary
 */
const getDashboardSummary = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || '';
    const cacheKey = `dashboard:summary:${storeId}`;

    const { value: summary } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.dashboard,
      async () => {
        // Get all active orders
        const orders = await Order.find({
          store_id: storeId,
          status: { $in: ['new', 'processing', 'ready'] },
        }).lean();

        const newOrders = orders.filter((o) => o.status === 'new').length;
        const breakdown = {
          normal: orders.filter((o) => o.order_type === 'Normal').length,
          priority: orders.filter((o) => o.order_type === 'Priority').length,
          express: orders.filter((o) => o.order_type === 'Express').length,
        };
        const total = breakdown.normal + breakdown.priority + breakdown.express;

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

        const activeStaff = await Staff.countDocuments({
          store_id: storeId,
          is_active: true,
        });
        const maxCapacity = 100;
        const capacityPercentage = Math.min(Math.round((activeStaff / maxCapacity) * 100), 100);

        const averageWaitSeconds = 252;
        const averageWait = formatWaitTime(averageWaitSeconds);
        const lastHourData = generateLastHourData();

        return {
          queue: { total, new_orders: newOrders, breakdown },
          sla_threat: { percentage: slaThreatPercentage, orders_at_risk: ordersAtRisk, orders_under_5min: ordersUnder5Min },
          store_capacity: { percentage: capacityPercentage, expected_peak_time: calculatePeakTime() },
          rider_wait_times: { average: averageWait, last_hour_data: lastHourData },
        };
      },
      res
    );
    res.status(200).json(summary);
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
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || '';
    const cacheKey = `dashboard:staff-load:${storeId}`;
    const { value: data } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.staff,
      async () => {
        const pickers = await Staff.find({ store_id: storeId, role: 'Picker' }).lean();
        const packers = await Staff.find({ store_id: storeId, role: 'Packer' }).lean();
        const activePickers = pickers.filter((p) => p.is_active);
        const activePackers = packers.filter((p) => p.is_active);
        const pickerLoadPercentage = pickers.length > 0 ? Math.round((activePickers.length / pickers.length) * 100) : 0;
        const packerLoadPercentage = packers.length > 0 ? Math.round((activePackers.length / packers.length) * 100) : 0;
        return {
          pickers: { active: activePickers.length, total: pickers.length, load_percentage: pickerLoadPercentage },
          packers: { active: activePackers.length, total: packers.length, load_percentage: packerLoadPercentage },
        };
      },
      res
    );
    res.status(200).json(data);
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
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || '';
    const severity = req.query.severity || 'all';
    const cacheKey = `dashboard:stock-alerts:${storeId}:${severity}`;
    const { value: data } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.dashboard,
      async () => {
        const query = { store_id: storeId, is_restocked: false };
        if (severity !== 'all') query.severity = severity;
        const alerts = await StockAlert.find(query).sort({ severity: -1, current_count: 1 }).lean();
        return {
          alerts: alerts.map((a) => ({
            item_name: a.item_name,
            sku: a.sku,
            current_count: a.current_count,
            threshold: a.threshold,
            severity: a.severity,
          })),
        };
      },
      res
    );
    res.status(200).json(data);
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
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || '';
    const cacheKey = `dashboard:rto-alerts:${storeId}`;
    const { value: data } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.dashboard,
      async () => {
        const alerts = await RTOAlert.find({ store_id: storeId, is_resolved: false })
          .sort({ severity: -1, createdAt: -1 })
          .lean();
        return {
          alerts: alerts.map((a) => ({
            order_id: a.order_id,
            issue_type: a.issue_type,
            description: a.description,
            severity: a.severity,
            customer_reachable: a.customer_reachable,
          })),
        };
      },
      res
    );
    res.status(200).json(data);
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
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || '';
    const status = req.query.status || 'all';
    let limit = parseInt(req.query.limit) || 50;
    if (limit > 100) limit = 100;
    if (limit < 1) limit = 50;
    const cacheKey = `dashboard:live-orders:${storeId}:${status}:${limit}`;
    const { value: data } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.dashboard,
      async () => {
        const query = {
          store_id: storeId,
          status: { $in: ['new', 'processing', 'ready'] },
        };
        if (status !== 'all') query.status = status;
        const orders = await Order.find(query).sort({ createdAt: -1 }).limit(limit).lean();
        const formattedOrders = orders.map((order) => {
          const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
          const slaDeadline = order.sla_deadline
            ? new Date(order.sla_deadline)
            : new Date(createdAt.getTime() + 15 * 60 * 1000);
          return {
            order_id: order.order_id,
            order_type: order.order_type,
            item_count: order.item_count,
            customer_name: order.customer_name || 'Customer',
            customer_phone: order.customer_phone || '',
            sla_timer: calculateSLATimer(slaDeadline),
            sla_status: getSLAStatus(slaDeadline),
            sla_deadline: slaDeadline.toISOString(),
            created_at: createdAt.toISOString(),
            assignee: order.assignee || { id: '', name: 'Unassigned', initials: 'UA' },
          };
        });
        return { orders: formattedOrders };
      },
      res
    );
    res.status(200).json(data);
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
    await cache.delByPattern('dashboard:*');
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

