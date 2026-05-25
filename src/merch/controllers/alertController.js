const Alert = require('../models/Alert');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const alertActionService = require('../services/alertActionService');

// @desc    Get all alerts
// @route   GET /api/v1/alerts
// @access  Public
const getAlerts = async (req, res, next) => {
  try {
    const { status, type, severity } = req.query;
    const query = {};

    if (type && type !== 'all') query.type = type;
    if (severity && severity !== 'all') query.severity = severity;
    
    if (status) {
        if (status === 'active') {
            query.status = { $nin: ['Resolved', 'Dismissed'] };
        } else if (status === 'resolved') {
            query.status = { $in: ['Resolved', 'Dismissed'] };
        } else if (status !== 'all') {
            query.status = status;
        }
    }

    const alerts = await Alert.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update alert status
// @route   PUT /api/v1/alerts/:id
// @access  Public
const updateAlert = async (req, res, next) => {
  try {
    let alert = await Alert.findById(req.params.id);

    if (!alert) {
      return next(new ErrorResponse(`Alert not found with id of ${req.params.id}`, 404));
    }

    alert = await Alert.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: alert
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Bulk update alerts
// @route   POST /api/v1/alerts/bulk-update
// @access  Public
const bulkUpdateAlerts = async (req, res, next) => {
  try {
    const { ids, update } = req.body;

    await Alert.updateMany(
      { _id: { $in: ids } },
      { $set: update }
    );

    res.status(200).json({
      success: true,
      message: `${ids.length} alerts updated successfully`
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Seed Alert Data
// @route   POST /api/v1/alerts/seed
// @access  Private
const seedAlertData = async (req, res, next) => {
  try {
    const now = new Date();
    const mockAlerts = [
      {
        type: 'Pricing',
        title: 'Pricing Conflict Detected',
        description: "SKU 'Organic Milk' has overlapping discounts in Campaign A and Campaign B, resulting in -5% margin.",
        severity: 'critical',
        status: 'New',
        region: 'Global',
        linkedEntities: {
          skus: ['Organic Milk'],
          campaigns: [{ id: 'A', name: 'Summer Sale' }, { id: 'B', name: 'Dairy Promo' }]
        },
        createdAt: new Date(now.getTime() - 10 * 60000)
      },
      {
        type: 'Stock',
        title: 'Stock Shortage Warning',
        description: "Promo item 'Chocolate Bar' is below safety stock in West End Hub. Campaign may stall.",
        severity: 'warning',
        status: 'New',
        region: 'West End',
        linkedEntities: {
          skus: ['Chocolate Bar'],
          store: 'West End Hub'
        },
        createdAt: new Date(now.getTime() - 60 * 60000)
      },
      {
        type: 'Campaign',
        title: 'Campaign Ending Soon',
        description: "'Summer Essentials' campaign ends in 24 hours. Review performance?",
        severity: 'info',
        status: 'New',
        region: 'Global',
        linkedEntities: {
          campaigns: [{ id: 'C', name: 'Summer Essentials' }]
        },
        createdAt: new Date(now.getTime() - 120 * 60000)
      },
      {
        type: 'System',
        title: 'Data Sync Delayed',
        description: "SAP ERP inventory sync is lagging by 45 minutes. Real-time stock may be inaccurate.",
        severity: 'critical',
        status: 'New',
        linkedEntities: {},
        createdAt: new Date(now.getTime() - 5 * 60000)
      }
    ];

    await Alert.deleteMany({});
    const alerts = await Alert.insertMany(mockAlerts);

    res.status(201).json({
      success: true,
      message: 'Alert data seeded successfully',
      count: alerts.length
    });
  } catch (err) {
    next(err);
  }
};

const resolvePricingConflict = async (req, res, next) => {
  try {
    const alert = await alertActionService.resolvePricingConflict(req.params.id, req.body);
    res.status(200).json({ success: true, data: alert });
  } catch (err) {
    if (err.message === 'Alert not found') {
      return next(new ErrorResponse(err.message, 404));
    }
    next(err);
  }
};

const allocateStock = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const result = await alertActionService.allocateStockForAlert(req.params.id, req.body, userId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'Alert not found') {
      return next(new ErrorResponse(err.message, 404));
    }
    res.status(400).json({ success: false, error: err.message });
  }
};

const pauseCampaign = async (req, res, next) => {
  try {
    const result = await alertActionService.pauseCampaignForAlert(req.params.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'Alert not found') {
      return next(new ErrorResponse(err.message, 404));
    }
    next(err);
  }
};

const clearResolvedAlerts = async (req, res, next) => {
  try {
    const count = await alertActionService.clearResolvedAlerts();
    res.status(200).json({ success: true, deletedCount: count });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAlerts,
  updateAlert,
  bulkUpdateAlerts,
  seedAlertData,
  resolvePricingConflict,
  allocateStock,
  pauseCampaign,
  clearResolvedAlerts,
};
