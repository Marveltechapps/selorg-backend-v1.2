const vendorService = require('../services/vendorService');
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

module.exports = {
  createVendor,
  listVendors,
  getVendor,
  putVendor,
  patchVendor,
  postAction,
};

// Additional handlers added to match OpenAPI vendor endpoints
const purchaseOrderService = require('../services/purchaseOrderService');
const qcService = require('../services/qcService');
const alertService = require('../services/alertService');
const vendorService = require('../services/vendorService');

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
    const metrics = await vendorService.getPerformance(req.params.vendorId, { startDate, endDate, resolution });
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

async function getVendorHealth(req, res, next) {
  try {
    const health = await vendorService.getHealth(req.params.vendorId);
    res.json(health);
  } catch (err) {
    next(err);
  }
}

// expose the new handlers
module.exports.listVendorPurchaseOrders = listVendorPurchaseOrders;
module.exports.listVendorQCChecks = listVendorQCChecks;
module.exports.createVendorQCCheck = createVendorQCCheck;
module.exports.listVendorAlerts = listVendorAlerts;
module.exports.createVendorAlert = createVendorAlert;
module.exports.getVendorPerformance = getVendorPerformance;
module.exports.getVendorHealth = getVendorHealth;
