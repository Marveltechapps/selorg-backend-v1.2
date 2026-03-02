const Allocation = require('../models/Allocation');
const ReplenishmentAlert = require('../models/ReplenishmentAlert');
const TransferOrder = require('../models/TransferOrder');
const SKU = require('../models/SKU');
const ErrorResponse = require('../../core/utils/ErrorResponse');

// @desc    Get all allocations
// @route   GET /api/v1/allocation
// @access  Public
const getAllocations = async (req, res, next) => {
  try {
    const allocations = await Allocation.find().populate('skuId');
    res.status(200).json({
      success: true,
      count: allocations.length,
      data: allocations
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update allocation
// @route   PUT /api/v1/allocation/:id
// @access  Private
const updateAllocation = async (req, res, next) => {
  try {
    const allocation = await Allocation.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!allocation) {
      return next(new ErrorResponse(`Allocation not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: allocation
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get replenishment alerts
// @route   GET /api/v1/allocation/alerts
// @access  Public
const getAlerts = async (req, res, next) => {
  try {
    const alerts = await ReplenishmentAlert.find({ status: 'active' }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create replenishment alert
// @route   POST /api/v1/allocation/alerts
// @access  Private
const createAlert = async (req, res, next) => {
  try {
    const alert = await ReplenishmentAlert.create(req.body);
    res.status(201).json({
      success: true,
      data: alert
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update alert status
// @route   PUT /api/v1/allocation/alerts/:id
// @access  Private
const updateAlertStatus = async (req, res, next) => {
  try {
    const alert = await ReplenishmentAlert.findByIdAndUpdate(req.params.id, { status: req.body.status }, {
      new: true,
      runValidators: true
    });

    if (!alert) {
      return next(new ErrorResponse(`Alert not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: alert
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Seed initial allocation data
// @route   POST /api/v1/allocation/seed
// @access  Private
const seedAllocationData = async (req, res, next) => {
  try {
    // This is a helper to quickly populate the DB with mock data for testing
    const skus = await SKU.find().limit(3);
    
    if (skus.length === 0) {
      return next(new ErrorResponse('Please seed SKUs first', 400));
    }

    const locations = [
      { id: 'l1', name: 'Downtown Hub' },
      { id: 'l2', name: 'Westside Hub' },
      { id: 'l3', name: 'North Hub' }
    ];

    const allocationData = [];
    for (const sku of skus) {
      for (const loc of locations) {
        allocationData.push({
          skuId: sku._id,
          locationId: loc.id,
          locationName: loc.name,
          allocated: Math.floor(Math.random() * 1000) + 500,
          target: 1500,
          onHand: Math.floor(Math.random() * 800) + 200,
          inTransit: Math.floor(Math.random() * 200),
          safetyStock: 400
        });
      }
    }

    await Allocation.deleteMany({});
    const allocations = await Allocation.insertMany(allocationData);

    // Also seed some alerts
    const alertData = [
      {
        type: 'low_stock',
        severity: 'critical',
        sku: skus[0].name,
        skuId: skus[0]._id,
        location: 'North Hub',
        message: 'Below safety stock (50 units). Projected stockout in 4 hours.',
        time: '4h'
      },
      {
        type: 'expiry',
        severity: 'warning',
        sku: skus[1].name,
        skuId: skus[1]._id,
        location: 'Westside Hub',
        batch: '9921',
        message: 'Batch #9921 expiring in 3 days. Consider running a clearance promo.',
        time: '3d'
      }
    ];

    await ReplenishmentAlert.deleteMany({});
    const alerts = await ReplenishmentAlert.insertMany(alertData);

    res.status(201).json({
      success: true,
      message: 'Allocation data seeded successfully',
      allocationsCount: allocations.length,
      alertsCount: alerts.length
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create transfer order
// @route   POST /api/v1/merch/allocation/transfers
// @access  Private
const createTransferOrder = async (req, res, next) => {
  try {
    const { skuId, skuName, fromLocation, toLocation, quantity, requiredDate } = req.body;
    if (!skuId || !skuName || !fromLocation || !toLocation || !quantity) {
      return next(new ErrorResponse('skuId, skuName, fromLocation, toLocation, and quantity are required', 400));
    }
    const order = await TransferOrder.create({
      skuId, skuName, fromLocation, toLocation, quantity: Number(quantity), requiredDate, status: 'pending'
    });
    // Optionally update allocation inTransit for destination
    const alloc = await Allocation.findOne({
      skuId: skuId.length === 24 ? skuId : null,
      locationName: new RegExp(toLocation, 'i')
    });
    if (alloc) {
      alloc.inTransit = (alloc.inTransit || 0) + Number(quantity);
      await alloc.save();
    }
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// @desc    Auto rebalance (server-side strategy)
// @route   POST /api/v1/merch/allocation/rebalance/auto
// @access  Private
const autoRebalance = async (req, res, next) => {
  try {
    const { scope = 'high-priority', strategy = 'minimize-stockouts' } = req.body;
    const allocations = await Allocation.find().populate('skuId').lean();
    const updates = [];
    const skuGroups = {};
    allocations.forEach((a) => {
      const skuId = (a.skuId?._id ?? a.skuId)?.toString?.();
      if (!skuId) return;
      if (!skuGroups[skuId]) skuGroups[skuId] = [];
      skuGroups[skuId].push(a);
    });
    for (const list of Object.values(skuGroups)) {
      const totalOnHand = list.reduce((s, a) => s + (a.onHand || 0), 0);
      const totalTarget = list.reduce((s, a) => s + (a.target || 0), 0);
      if (totalTarget <= 0) continue;
      const perLoc = Math.floor(totalOnHand / list.length);
      list.forEach((a, i) => {
        const newTarget = i === list.length - 1 ? totalOnHand - perLoc * (list.length - 1) : perLoc;
        if (a.target !== newTarget) updates.push({ allocationId: a._id.toString(), target: newTarget, allocated: newTarget });
      });
    }
    const results = [];
    for (const u of updates) {
      const alloc = await Allocation.findByIdAndUpdate(u.allocationId, { target: u.target, allocated: u.allocated }, { new: true });
      if (alloc) results.push(alloc);
    }
    res.status(200).json({ success: true, data: results, count: results.length });
  } catch (err) {
    next(err);
  }
};

// @desc    Apply rebalance
// @route   POST /api/v1/merch/allocation/rebalance
// @access  Private
const rebalanceAllocations = async (req, res, next) => {
  try {
    const { skuId, strategy, updates } = req.body;
    // updates: [{ allocationId, allocated, target, onHand, inTransit }]
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return next(new ErrorResponse('updates array is required', 400));
    }
    const results = [];
    for (const u of updates) {
      if (!u.allocationId) continue;
      const alloc = await Allocation.findByIdAndUpdate(u.allocationId, {
        $set: {
          ...(u.allocated != null && { allocated: u.allocated }),
          ...(u.target != null && { target: u.target }),
          ...(u.onHand != null && { onHand: u.onHand }),
          ...(u.inTransit != null && { inTransit: u.inTransit }),
        }
      }, { new: true });
      if (alloc) results.push(alloc);
    }
    res.status(200).json({ success: true, data: results, count: results.length });
  } catch (err) {
    next(err);
  }
};

// @desc    Get allocation history for demand/stock chart (per SKU)
// @route   GET /api/v1/merch/allocation/sku/:skuId/history
// @access  Private
const getAllocationHistory = async (req, res, next) => {
  try {
    // No history data stored in DB yet - return empty. Frontend shows "No history data" empty state.
    res.status(200).json({ success: true, data: [] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllocations,
  updateAllocation,
  getAlerts,
  createAlert,
  updateAlertStatus,
  seedAllocationData,
  createTransferOrder,
  rebalanceAllocations,
  autoRebalance,
  getAllocationHistory
};
