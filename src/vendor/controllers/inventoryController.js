const inventoryService = require('../services/inventoryService');

async function getSummary(req, res, next) {
  try {
    const summary = await inventoryService.getInventorySummary(req.params.vendorId, req.query);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function listStock(req, res, next) {
  try {
    const list = await inventoryService.listStock(req.params.vendorId, req.query);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function postSync(req, res, next) {
  try {
    const job = await inventoryService.triggerSync(req.params.vendorId, req.body);
    res.status(202).json(job);
  } catch (err) {
    next(err);
  }
}

async function postReconcile(req, res, next) {
  try {
    const result = await inventoryService.reconcile(req.params.vendorId, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listAgingAlerts(req, res, next) {
  try {
    const list = await inventoryService.listAgingAlerts(req.params.vendorId, req.query);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

async function ackAlert(req, res, next) {
  try {
    const Alert = require('../models/Alert');
    const vendorId = req.params.vendorId;
    const requestedId = req.params.alertId;

    if (!vendorId) {
      return res.status(400).json({ code: 400, message: 'vendorId path parameter is required' });
    }

    // Support both seeded `alertId` field and MongoDB _id lookup, and ensure the alert belongs to the vendor
    const alert = await Alert.findOne({
      vendorId,
      $or: [{ _id: requestedId }, { alertId: requestedId }],
    });

    if (!alert) return res.status(404).json({ code: 404, message: 'Not found' });
    alert.acknowledged = true;
    if (req.body.acknowledgedBy) alert.acknowledgedBy = req.body.acknowledgedBy;
    if (req.body.note) alert.note = req.body.note;
    await alert.save();
    res.json(alert.toObject());
  } catch (err) {
    next(err);
  }
}

async function getStockouts(req, res, next) {
  try {
    const stockouts = await inventoryService.listStockouts(req.params.vendorId, req.query);
    res.json(stockouts);
  } catch (err) {
    next(err);
  }
}

async function getAgingInventory(req, res, next) {
  try {
    const aging = await inventoryService.listAgingInventory(req.params.vendorId, req.query);
    res.json(aging);
  } catch (err) {
    next(err);
  }
}

async function getKPIs(req, res, next) {
  try {
    const kpis = await inventoryService.getKPIs(req.params.vendorId, req.query);
    res.json(kpis);
  } catch (err) {
    next(err);
  }
}

module.exports = { 
  getSummary, 
  listStock, 
  postSync, 
  postReconcile, 
  listAgingAlerts, 
  ackAlert,
  getStockouts,
  getAgingInventory,
  getKPIs,
};