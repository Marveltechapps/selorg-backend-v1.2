const vendorService = require('../services/vendorService');
const vendorMetricsService = require('../services/vendorMetricsService');
const purchaseOrderService = require('../services/purchaseOrderService');
const qcService = require('../services/qcService');
const alertService = require('../services/alertService');
const { validationResult } = require('express-validator');

async function createVendor(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ code: 400, message: 'Validation error', details: errors.array() });
    const vendor = await vendorService.createVendor(req.body);
    res.status(201).json(vendor);
  } catch (err) {
    next(err);
  }
}

async function listVendors(req, res, next) {
  try {
    const result = await vendorService.listVendors(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getVendor(req, res, next) {
  try {
    const vendor = await vendorService.getVendorById(req.params.vendorId);
    res.json(vendor);
  } catch (err) {
    next(err);
  }
}

async function putVendor(req, res, next) {
  try {
    const vendor = await vendorService.updateVendor(req.params.vendorId, req.body);
    res.json(vendor);
  } catch (err) {
    next(err);
  }
}

async function patchVendor(req, res, next) {
  try {
    const vendor = await vendorService.patchVendor(req.params.vendorId, req.body);
    res.json(vendor);
  } catch (err) {
    next(err);
  }
}

async function postAction(req, res, next) {
  try {
    const result = await vendorService.performAction(req.params.vendorId, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listVendorPurchaseOrders(req, res, next) {
  try {
    const query = Object.assign({}, req.query, { vendorId: req.params.vendorId });
    const result = await purchaseOrderService.listPurchaseOrders(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listVendorQCChecks(req, res, next) {
  try {
    const query = Object.assign({}, req.query, { vendorId: req.params.vendorId });
    const result = await qcService.listQCChecks(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createVendorQCCheck(req, res, next) {
  try {
    const payload = Object.assign({}, req.body, { vendorId: req.params.vendorId });
    const created = await qcService.createQCCheck(payload);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

async function listVendorAlerts(req, res, next) {
  try {
    const result = await alertService.listAlerts({ vendorId: req.params.vendorId, ...req.query });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createVendorAlert(req, res, next) {
  try {
    const payload = Object.assign({}, req.body, { vendorId: req.params.vendorId });
    const created = await alertService.createAlert(payload);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

async function getVendorPerformance(req, res, next) {
  try {
    const { startDate, endDate, resolution } = req.query;
    const metrics = await vendorMetricsService.getPerformance(req.params.vendorId, { startDate, endDate, resolution });
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

async function getVendorHealth(req, res, next) {
  try {
    const health = await vendorMetricsService.getHealth(req.params.vendorId);
    res.json(health);
  } catch (err) {
    next(err);
  }
}

async function getVendorSummary(req, res, next) {
  try {
    const Vendor = require('../models/Vendor');
    const Shipment = require('../models/Shipment');
    const QCCheck = require('../models/QCCheck');
    const Certificate = require('../models/Certificate');

    // Active vendors count
    const activeVendors = await Vendor.countDocuments({ status: 'active' });
    const totalVendors = await Vendor.countDocuments({});
    const pendingVendors = await Vendor.countDocuments({ status: 'under_review' });

    // Delivery Timeliness
    const totalDeliveries = await Shipment.countDocuments({
      estimatedArrival: { $exists: true },
      deliveredAt: { $exists: true }
    });
    const onTimeDeliveries = await Shipment.countDocuments({
      estimatedArrival: { $exists: true },
      deliveredAt: { $exists: true },
      $expr: { $lte: ['$deliveredAt', '$estimatedArrival'] }
    });
    const deliveryTimeliness = totalDeliveries === 0
      ? 0
      : Math.round((onTimeDeliveries / totalDeliveries) * 1000) / 10;

    // Product Quality (QC Pass Rate)
    const totalQC = await QCCheck.countDocuments({});
    const passedQC = await QCCheck.countDocuments({
      status: { $in: ['approved', 'passed', 'pass'] }
    });
    const productQuality = totalQC === 0
      ? 0
      : Math.round((passedQC / totalQC) * 1000) / 10;

    // Rejection Rate
    const rejectedQC = await QCCheck.countDocuments({
      status: { $in: ['rejected', 'failed', 'fail'] }
    });
    const rejectionRate = totalQC === 0
      ? 0
      : Math.round((rejectedQC / totalQC) * 1000) / 10;

    // Compliance Status
    const vendorsWithValidDocs = await Certificate.distinct('vendorId', {
      status: 'valid'
    });
    const complianceStatus = activeVendors === 0
      ? 0
      : Math.round((vendorsWithValidDocs.length / activeVendors) * 1000) / 10;
    // Avg PO Response Hours - PurchaseOrder model does not have acknowledgedAt/acceptedAt in schema
    // so we default to 0 until such a field is available in the DB.
    const avgPOResponseHours = 0;

    res.json({
      activeVendors,
      totalVendors,
      pendingVendors,
      slaCompliance: deliveryTimeliness,
      openPOs: 0,
      criticalAlerts: 0,
      deliveryTimeliness,
      productQuality,
      complianceStatus,
      rejectionRate,
      avgPOResponseHours,
      topPerformers: []
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createVendor,
  listVendors,
  getVendor,
  putVendor,
  patchVendor,
  postAction,
  listVendorPurchaseOrders,
  listVendorQCChecks,
  createVendorQCCheck,
  listVendorAlerts,
  createVendorAlert,
  getVendorPerformance,
  getVendorHealth,
  getVendorSummary,
};

