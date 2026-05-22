const inventoryService = require('../services/inventoryService');
const { mergeHubFilter } = require('../constants/hubScope');

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

async function listHubAgingAlerts(req, res, next) {
  try {
    const list = await inventoryService.listHubAgingAlerts();
    res.json(list);
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
    const InventoryItem = require('../models/InventoryItem');
    const { mergeHubFilter, hubFieldsForCreate } = require('../constants/hubScope');
    const vendorId = req.params.vendorId;
    const requestedId = req.params.alertId;

    if (!vendorId) {
      return res.status(400).json({ code: 400, message: 'vendorId path parameter is required' });
    }

    // Support both seeded `alertId` field and MongoDB _id lookup, and ensure the alert belongs to the vendor
    const alert = await Alert.findOne(
      mergeHubFilter({
        vendorId,
        $or: [{ _id: requestedId }, { alertId: requestedId }],
      })
    );

    if (!alert) {
      const invPrefix = 'inv-';
      if (String(requestedId).startsWith(invPrefix)) {
        const inventoryItemId = String(requestedId).slice(invPrefix.length);
        const item = await InventoryItem.findOne(
          mergeHubFilter({ _id: inventoryItemId, vendorId })
        );
        if (!item) return res.status(404).json({ code: 404, message: 'Not found' });
        const created = await Alert.create({
          ...hubFieldsForCreate(),
          vendorId,
          alertId: `ACK-INV-${Date.now()}`,
          title: item.name || item.sku,
          productName: item.name || item.sku,
          batchId: item.batchId || item.sku,
          type: 'aging',
          severity: 'medium',
          status: 'acknowledged',
          message: req.body.note || 'Acknowledged from inventory dashboard',
          acknowledged: true,
          acknowledgedBy: req.body.acknowledgedBy || 'dashboard',
          note: req.body.note,
          quantity: item.quantity,
          unit: item.unit,
          value: Math.round((item.unitPrice || 0) * (item.quantity || 0)),
        });
        return res.json(created.toObject());
      }
      return res.status(404).json({ code: 404, message: 'Not found' });
    }
    alert.acknowledged = true;
    alert.status = 'acknowledged';
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

async function getSupplyPerformance(req, res, next) {
  try {
    const data = await inventoryService.getSupplyPerformance(req.params.vendorId);
    res.json(data);
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

async function postBulkReorder(req, res, next) {
  try {
    const result = await inventoryService.bulkReorder(req.params.vendorId, req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function postReturn(req, res, next) {
  try {
    const result = await inventoryService.initiateReturn(req.params.vendorId, {
      inventoryItemId: req.params.itemId,
      ...req.body,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function postLiquidate(req, res, next) {
  try {
    const result = await inventoryService.initiateLiquidation(req.params.vendorId, {
      inventoryItemId: req.params.itemId,
      ...req.body,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function postAlertAllVendors(req, res, next) {
  try {
    const result = await inventoryService.alertAllVendors(req.params.vendorId, req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { 
  getSummary, 
  listStock, 
  postSync, 
  postReconcile, 
  listHubAgingAlerts,
  listAgingAlerts, 
  ackAlert,
  getStockouts,
  getAgingInventory,
  getSupplyPerformance,
  getKPIs,
  postBulkReorder,
  postAlertAllVendors,
  postReturn,
  postLiquidate,
};